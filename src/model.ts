module powerbi.extensibility.visual {
    import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;
    import ColorHelper = powerbi.extensibility.utils.color.ColorHelper;
    import ISelectionId = powerbi.visuals.ISelectionId;

    export interface ChartDataPoint {
        value: number;
        category: string;
        uri: string;
        color: string;
        imageUrl?: string;
        highlighted?: boolean;
        selectionId: ISelectionId;
    }

    export interface ChartDataPointNode extends d3.layout.treemap.Node {
        datapoint?: ChartDataPoint;
    }

    export interface ChartViewModel {
        dataPoints: ChartDataPointNode[];
        dataMax: number;
        dataMin: number;
        hasImageUrls: boolean;
        settings: Settings;
    }

    export function visualTransform(options: VisualUpdateOptions, host: IVisualHost): ChartViewModel {
        const dataViews = options.dataViews;

        if (!dataViews
            || !dataViews[0]
            || !dataViews[0].categorical
            || !dataViews[0].categorical.categories
            || !dataViews[0].categorical.categories[0])
            return {
                dataPoints: [],
                dataMax: 0,
                dataMin: 0,
                hasImageUrls: false,
                settings: Settings.getDefault() as Settings
            };


        const dataView = dataViews[0];
        const settings = Settings.parse<Settings>(dataView);

        const categorical = dataViews[0].categorical;
        const category = categorical.categories[0];
        const imageUrls = categorical.categories[1];
        const hasImageUrls = imageUrls && imageUrls.source && imageUrls.source.type && imageUrls.source.type.misc && imageUrls.source.type.misc.imageUrl;
        const values = categorical.values && categorical.values[0] && categorical.values[0].values;
        const highlights = categorical.values && categorical.values[0] && categorical.values[0].highlights;

        const columnCount = category.values.length;

        const dataPoints: ChartDataPointNode[] = [];

        const uriPrefix = settings.image.resize ? "resized" : "fixed";
        let dataMax: number | undefined = undefined;
        let dataMin: number | undefined = undefined;
        let dataSum: number = 0;
        for (let i = 0; i < columnCount; i++) {
            const value = values && (values[i] as number) || 1;
            const imageUrl = imageUrls && (imageUrls.values[i] + "");
            const name = category.values[i] + "";
            const highlighted = highlights && (highlights[i] !== null);

            if (value) {

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

                const color = host.colorPalette.getColor(name).value;
                const datapoint = {
                    category: name,
                    uri: `${uriPrefix}-${encodeURIComponent(name)}`,
                    value: value,
                    color: color,
                    imageUrl: imageUrl,
                    highlighted: highlighted,
                    selectionId: host.createSelectionIdBuilder()
                        .withCategory(category, i)
                        .createSelectionId()
                };

                dataPoints.push({ datapoint: datapoint, value: datapoint.value });
            }
        }


        return {
            dataPoints: dataPoints,
            dataMax: dataMax,
            dataMin: dataMin,
            hasImageUrls: hasImageUrls,
            settings: settings
        };

    }


}