module powerbi.extensibility.visual {
    import DataViewObjects = powerbi.extensibility.utils.dataview.DataViewObjects;
    import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
    import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import tooltip = powerbi.extensibility.utils.tooltip;
    import svgUtils = powerbi.extensibility.utils.svg;

    const colorSelector = { objectName: "colorSelector", propertyName: "fill" };
    const enableImagesSelector = { objectName: "enableImages", propertyName: "show" };
    const generalViewOpacitySelector = { objectName: "generalView", propertyName: "opacity" };

    interface Settings {
        enableImages: {
            show: boolean;
        };
        generalView: {
            opacity: number;
        };
    }

    interface ChartDataPoint {
        value: number;
        category: string;
        color: string;
        imageUrl?: string;
        selectionId: ISelectionId;
    }

    interface ChartDataPointNode extends d3.layout.treemap.Node {
        datapoint?: ChartDataPoint;
    }

    interface ChartViewModel {
        dataPoints: ChartDataPointNode[];
        dataMax: number;
        dataMin: number;
        hasImageUrls: boolean;
        settings: Settings;
    }

    const defaultSettings = {
        enableImages: {
            show: true
        },
        generalView: {
            opacity: 100
        }
    };

    const emptyViewModel = {
        dataPoints: [],
        dataMax: 0,
        dataMin: 1,
        hasImageUrls: false,
        settings: defaultSettings
    };


    function visualTransform(options: VisualUpdateOptions, host: IVisualHost) {
        const dataViews = options.dataViews;

        if (!dataViews
            || !dataViews[0]
            || !dataViews[0].categorical
            || !dataViews[0].categorical.categories
            || !dataViews[0].categorical.categories[0]) {
            return emptyViewModel;
        }

        const categorical = dataViews[0].categorical;
        const category = categorical.categories[0];
        const hasValues = !!(categorical.values && categorical.values[0]);
        const imageUrlColumns = dataViews[0].metadata.columns.filter(c => c && c.type && c.type.misc && c.type.misc.imageUrl);
        const hasImageUrls = hasValues && imageUrlColumns.length > 0;

        const columnCount = category.values.length;
        const dataPoints: ChartDataPointNode[] = [];

        let colorPalette: IColorPalette = host.colorPalette;
        let objects = dataViews[0].metadata.objects;
        const settings = {
            enableImages: {
                show: hasImageUrls && DataViewObjects.getValue<boolean>(objects, enableImagesSelector, defaultSettings.enableImages.show)
            },
            generalView: {
                opacity: DataViewObjects.getValue<number>(objects, generalViewOpacitySelector, defaultSettings.generalView.opacity),
            }
        };

        let dataMax: number | undefined = undefined;
        let dataMin: number | undefined = undefined;
        let dataSum: number = 0;
        for (let i = 0; i < columnCount; i++) {
            let value: number;
            let url: string | undefined;
            let selectionId: ISelectionId;
            const name = category.values[i] + "";

            if (hasValues) {
                if (hasImageUrls) {
                    const column = categorical.values[i];
                    url = column.source.groupName as string;
                    value = column.values[i] as number;
                } else {
                    const column = categorical.values[0];
                    value = column.values[i] as number;
                    url = undefined;
                }
            }
            else {
                url = undefined;
                value = 1;
            }

            const defaultColor = colorPalette.getColor(name).value;
            dataSum += value;

            if (dataMax === undefined) {
                dataMax = value;
            } else if (value > dataMax) {
                dataMax = value;
            }
            if (dataMin === undefined) {
                dataMin = value;
            } else if (value < dataMin) {
                dataMin = value;
            }

            const color = DataViewObjects.getFillColor(objects, colorSelector, defaultColor);
            const datapoint = {
                category: name,
                value: value,
                color: color,
                imageUrl: url,
                selectionId: host.createSelectionIdBuilder()
                    .withCategory(category, i)
                    .createSelectionId()
            };

            dataPoints.push({ datapoint: datapoint, value: datapoint.value });
        }


        return {
            dataPoints: dataPoints,
            dataMax: dataMax,
            dataMin: dataMin,
            hasImageUrls: hasImageUrls,
            settings: settings
        };

    }

    export class Visual implements IVisual {
        private readonly formatter: utils.formatting.IValueFormatter;
        private readonly svg: d3.Selection<SVGElement>;
        private readonly container: d3.Selection<SVGElement>;
        private readonly host: IVisualHost;
        private readonly selectionManager: ISelectionManager;
        private readonly defs: d3.Selection<SVGDefsElement>;
        private tooltipServiceWrapper: tooltip.ITooltipServiceWrapper;
        private settings: Settings;
        private dataPoints: ChartDataPointNode[];

        static Config = {
            solidOpacity: 1,
            transparentOpacity: 0.3
        };

        constructor(options: VisualConstructorOptions) {
            this.formatter = valueFormatter.create({ value: 0, precision: 3 });
            this.selectionManager = options.host.createSelectionManager();
            this.host = options.host;
            this.tooltipServiceWrapper = tooltip.createTooltipServiceWrapper(this.host.tooltipService, options.element);
            const svg = this.svg = d3.select(options.element)
                .append("svg")
                .classed("imageTreeMap", true);
            this.container = svg.append("g")
                .classed("container", true);
            this.defs = svg.append("defs");
        }

        public update(options: VisualUpdateOptions) {
            try {
                const viewModel: ChartViewModel = visualTransform(options, this.host);
                const settings = this.settings = viewModel.settings;
                const dataPoints = this.dataPoints = viewModel.dataPoints;

                const width = options.viewport.width;
                const height = options.viewport.height;
                const radius = Math.min(width, height) / 2;

                this.svg.attr({
                    width: width,
                    height: height
                });

                if (dataPoints.length === 0) {
                    return;
                }

                const useImages = viewModel.hasImageUrls && settings.enableImages.show;


                if (useImages) {
                    const patterns = this.defs.selectAll("pattern").data(viewModel.dataPoints);
                    const imageWidth = radius;
                    const imageHeight = (imageWidth / 1024) * 768;
                    patterns.enter()
                        .append("pattern")
                        .attr("patternUnits", "userSpaceOnUse")
                        .attr("width", imageWidth)
                        .attr("height", imageHeight)
                        .attr("id", d => `bg-${d.datapoint.category}`)
                        .append("image")
                        .attr("xlink:href", d => d.datapoint.imageUrl)
                        .attr("width", imageWidth)
                        .attr("height", imageHeight);

                    patterns.exit()
                        .remove();
                }


                const range = viewModel.dataMax - viewModel.dataMin;
                const min = range === 0 ? 0 : (viewModel.dataMin - (range * 0.1));
                const treemap = d3.layout.treemap<ChartDataPointNode>()
                    .mode("squarify")
                    .size([width, height])
                    .round(false)
                    .value(d => d.value - min);

                const root = { children: dataPoints };
                const nodes = treemap.nodes(root);

                const cells = this.container.selectAll(".cell")
                    .data(nodes);

                cells
                    .enter()
                    .append("rect")
                    .classed("cell", true);

                cells
                    .attr("transform", d => `translate(${d.x}, ${d.y})`)
                    .attr("width", d => d.dx)
                    .attr("height", d => d.dy)
                    .attr("fill-opacity", viewModel.settings.generalView.opacity / 100);

                if (useImages) {
                    cells
                        .attr("fill", d => {
                            if (d.datapoint) {
                                return `url(#bg-${d.datapoint.category})`;
                            } else {
                                return "#000000";
                            }
                        });
                }
                else {
                    cells
                        .attr("fill", d => d.datapoint && d.datapoint.color || "#000000");
                }

                cells.exit()
                    .remove();

                this.tooltipServiceWrapper.addTooltip(this.container.selectAll(".cell"),
                    (tooltipEvent: tooltip.TooltipEventArgs<number>) => this.getTooltipData(tooltipEvent.data),
                    (tooltipEvent: tooltip.TooltipEventArgs<number>) => null);

                const selectionManager = this.selectionManager;
                const allowInteractions = this.host.allowInteractions;

                // This must be an anonymous function instead of a lambda because
                // d3 uses 'this' as the reference to the element that was clicked.
                cells.on("click", function (d) {
                    // Allow selection only if the visual is rendered in a view that supports interactivity (e.g. Report)
                    if (allowInteractions) {
                        selectionManager.select(d.datapoint.selectionId).then((ids: ISelectionId[]) => {
                            cells.attr({
                                "fill-opacity": ids.length > 0 ? Visual.Config.transparentOpacity : Visual.Config.solidOpacity
                            });

                            d3.select(this).attr({
                                "fill-opacity": Visual.Config.solidOpacity
                            });
                        });

                        (<Event>d3.event).stopPropagation();
                    }
                });

            }
            catch (ex) {
                console.warn(ex);
                throw ex;
            }

        }

        private getTooltipData(node: ChartDataPointNode) {
            return [{
                displayName: node.datapoint.category,
                value: this.formatter.format(node.value),
                color: node.datapoint.color
            }];
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            let objectName = options.objectName;
            let objectEnumeration: VisualObjectInstance[] = [];

            switch (objectName) {
                case "enableImages":
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            show: this.settings.enableImages.show,
                        },
                        selector: null
                    });
                    break;

                case "colorSelector":
                    for (let dataPoint of this.dataPoints) {
                        objectEnumeration.push({
                            objectName: objectName,
                            displayName: dataPoint.datapoint.category,
                            properties: {
                                fill: {
                                    solid: {
                                        color: dataPoint.datapoint.color
                                    }
                                }
                            },
                            selector: dataPoint.datapoint.selectionId
                        });
                    }
                    break;

                case "generalView":
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: {
                            opacity: this.settings.generalView.opacity,
                        },
                        validValues: {
                            opacity: {
                                numberRange: {
                                    min: 10,
                                    max: 100
                                }
                            }
                        },
                        selector: null
                    });
                    break;
            }

            return objectEnumeration;
        }

    }
}
