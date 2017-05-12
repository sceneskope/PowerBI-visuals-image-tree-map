module powerbi.extensibility.visual {
    import DataViewObjectsParser = powerbi.extensibility.utils.dataview.DataViewObjectsParser;
    import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;

    export class ImageSettings {
        public show = true;
        public resize = false;
    }

    export class ColorSettings {
        public fill = "#ffffff";
    }

    export class GeneralViewSettings {
        public opacity = 100;
    }

    export const fillColorPropertyIdentifier: DataViewObjectPropertyIdentifier = {
        objectName: "color",
        propertyName: "fill"
    }

    export class Settings extends DataViewObjectsParser {
        public image = new ImageSettings();
        public color = new ColorSettings();
        public generalView = new GeneralViewSettings();
    }
}
