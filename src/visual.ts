module powerbi.extensibility.visual {
    import DataViewObjects = powerbi.extensibility.utils.dataview.DataViewObjects;
    import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
    import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import tooltip = powerbi.extensibility.utils.tooltip;
    import svgUtils = powerbi.extensibility.utils.svg;
    import ColorHelper = powerbi.extensibility.utils.color.ColorHelper;

    export class Visual implements IVisual {
        private readonly formatter: utils.formatting.IValueFormatter;
        private readonly svg: d3.Selection<SVGElement>;
        private readonly container: d3.Selection<SVGElement>;
        private readonly host: IVisualHost;
        private readonly selectionManager: ISelectionManager;
        private readonly defs: d3.Selection<SVGDefsElement>;
        private tooltipServiceWrapper: tooltip.ITooltipServiceWrapper;
        private viewModel?: ChartViewModel;

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
                const viewModel = this.viewModel = visualTransform(options, this.host);
                const settings = viewModel.settings;
                const dataPoints = viewModel.dataPoints;

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

                const useImages = viewModel.hasImageUrls && settings.image.show;


                if (useImages) {
                    const imageWidth = radius;
                    const imageHeight = (imageWidth / 1024) * 768;
                    const fixedPatterns = this.defs
                        .selectAll(".fixedPattern")
                        .data(viewModel.dataPoints);

                    const resizedPatterns = this.defs
                        .selectAll(".resizedPattern")
                        .data(viewModel.dataPoints);

                    fixedPatterns
                        .enter()
                        .append("pattern")
                        .attr("class", "fixedPattern")
                        .attr("patternUnits", "userSpaceOnUse")
                        .attr("width", imageWidth)
                        .attr("height", imageHeight)
                        .attr("id", d => `fixed-${d.datapoint.uri}`)
                        .append("image")
                        .attr("width", imageWidth)
                        .attr("height", imageHeight)
                        .attr("xlink:href", d => d.datapoint.imageUrl);

                    fixedPatterns.exit()
                        .remove();

                    resizedPatterns
                        .enter()
                        .append("pattern")
                        .attr("class", "resizedPattern")
                        .attr("patternUnits", "userSpaceOnUse")
                        .attr("width", imageWidth)
                        .attr("height", imageWidth)
                        .attr("id", d => `resize-${d.datapoint.uri}`)
                        .append("image")
                        .attr("width", imageWidth)
                        .attr("height", imageWidth)
                        .attr("xlink:href", d => d.datapoint.imageUrl);

                    resizedPatterns.exit()
                        .remove();
                }


                const range = viewModel.dataMax - viewModel.dataMin;
                const min = range === 0 ? 0 : Math.round((viewModel.dataMin - (range * 0.1)));
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
                    .attr("fill-opacity", d => {
                        if (d.datapoint) {
                        if ((d.datapoint.highlighted === undefined) || d.datapoint.highlighted) {
                            return viewModel.settings.generalView.opacity / 100;
                        } else {
                            return Visual.Config.transparentOpacity
                        }
                        } else {
                            return 0;
                        }
                    });

                if (useImages) {
                    cells
                        .attr("fill", d => {
                            if (d.datapoint) {
                                if (d.datapoint.resize) {
                                    return `url(#resize-${d.datapoint.uri})`;
                                } else {
                                    return `url(#fixed-${d.datapoint.uri})`;
                                }
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
                value: this.formatter.format(node.datapoint.value),
                color: node.datapoint.color
            }];
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstanceEnumeration {
            try {
                const settings = this.viewModel ? this.viewModel.settings : Settings.getDefault() as Settings;
                const instanceEnumeration = Settings.enumerateObjectInstances(settings, options);
                if (options.objectName === "color") {
                    for (let dataPoint of this.viewModel.dataPoints) {
                        this.addAnInstanceToEnumeration(instanceEnumeration,
                            {
                                objectName: options.objectName,
                                displayName: dataPoint.datapoint.category,
                                properties: {
                                    fill: {
                                        solid: {
                                            color: dataPoint.datapoint.color
                                        }
                                    }
                                },
                                selector: ColorHelper.normalizeSelector(dataPoint.datapoint.selectionId.getSelector(), false)
                            });
                    }
                }
                return instanceEnumeration || [];
            }
            catch (ex) {
                console.warn(ex);
                throw ex;
            }
        }

        private addAnInstanceToEnumeration(
            instanceEnumeration: VisualObjectInstanceEnumeration,
            instance: VisualObjectInstance): void {

            if ((instanceEnumeration as VisualObjectInstanceEnumerationObject).instances) {
                (instanceEnumeration as VisualObjectInstanceEnumerationObject)
                    .instances
                    .push(instance);
            } else {
                (instanceEnumeration as VisualObjectInstance[]).push(instance);
            }
        }
    }
}
