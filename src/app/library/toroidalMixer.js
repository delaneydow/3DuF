import Template from "./template";
import paper from "paper";
import ComponentPort from "../core/componentPort";
import { Path, Point } from "paper/dist/paper-core";
//import { cosh } from "core-js/core/number";

export default class ToroidalMixer extends Template {
    constructor() {
        super();
    }

    __setupDefinitions() {
        this.__unique = {
            position: "Point"
        };

        this.__heritable = {
            componentSpacing: "Float",
            neckAngle: "Float",
            neckLength: "Float",
            neckWidth: "Float",
            numberOfMixers: "Float",
            channelWidth: "Float",
            innerDiameter: "Float",
            rotation: "Float",
            height: "Float"
        };

        this.__defaults = {
            componentSpacing: 1000,
            rotation: 0,
            channelWidth: 0.8 * 1000,
            neckAngle: 120,
            neckLength: 1000,
            neckWidth: 800,
            numberOfMixers: 1,
            innerDiameter: 2.46 * 1000,
            height: 250
        };

        this.__units = {
            componentSpacing: "μm",
            rotation: "°",
            neckAngle: "°",
            neckLength: "μm",
            neckWidth: "μm",
            numberOfMixers: "",
            channelWidth: "μm",
            innerDiameter: "μm",
            height: "μm"
        };

        this.__minimum = {
            componentSpacing: 0,
            rotation: 0,
            channelWidth: 10,
            neckAngle: 0,
            neckLength: 0,
            neckWidth: 10,
            numberOfMixers: 1,
            innerDiameter: 10,
            height: 10
        };

        this.__maximum = {
            componentSpacing: 10000,
            rotation: 360,
            channelWidth: 2000,
            neckAngle: 360,
            neckLength: 10000,
            neckWidth: 2000,
            numberOfMixers: 20,
            innerDiameter: 12 * 1000,
            height: 1200
        };

        this.__featureParams = {
            componentSpacing: "componentSpacing",
            position: "position",
            channelWidth: "channelWidth",
            neckAngle: "neckAngle",
            neckLength: "neckLength",
            neckWidth: "neckWidth",
            numberOfMixers: "numberOfMixers",
            rotation: "rotation",
            innerDiameter: "innerDiameter"
        };

        this.__targetParams = {
            componentSpacing: "componentSpacing",
            channelWidth: "channelWidth",
            neckAngle: "neckAngle",
            neckLength: "neckLength",
            neckWidth: "neckWidth",
            numberOfMixers: "numberOfMixers",
            rotation: "rotation",
            innerDiameter: "innerDiameter"
        };

        this.__placementTool = "componentPositionTool";

        this.__toolParams = {
            position: "position"
        };

        this.__renderKeys = ["FLOW"];

        this.__mint = "TOROIDAL MIXER";

        this.__zOffsetKeys = {
            FLOW: "height"
        };

        this.__substrateOffset = {
            FLOW: "0"
        };
    }

    getPorts(params) {
        const channelWidth = params.channelWidth;
        const innerDiameter = params.innerDiameter;
        const neckAngle = params.neckAngle;
        const numberOfMixers = params.numberOfMixers;

        const ports = [];

        ports.push(new ComponentPort(innerDiameter / 2 + channelWidth, 0, "1", "FLOW"));

        ports.push(new ComponentPort(innerDiameter / 2 + channelWidth, (2 * numberOfMixers + 1) * channelWidth + 2 * numberOfMixers * neckAngle, "2", "FLOW"));

        return ports;
    }

    render2D(params, key) {
        const channelWidth = params.channelWidth;
        const innerDiameter = params.innerDiameter;
        const neckAngle = params.neckAngle;
        const neckWidth = params.neckWidth;
        const rotation = params.rotation;
        const neckLength = params.neckLength;
        const numMixers = params.numberOfMixers;
        const x = params.position[0];
        const y = params.position[1];
        const color = params.color;
        const serp = new paper.CompoundPath();
        const x_center = x - (neckLength + channelWidth + 0.5 * innerDiameter) * Math.cos((0.5 * neckAngle * Math.PI) / 180);
        const y_center = y + Math.abs((neckLength + channelWidth + 0.5 * innerDiameter) * Math.sin((0.5 * neckAngle * Math.PI) / 180));
        const center = new paper.Point(x_center, y_center);
        const diameter = 2 * (y_center - y);

        let mixerUnit;

        //Initial ring
        let outerCircle = new paper.Path.Circle(center, 0.5 * innerDiameter + channelWidth);
        let innerCircle = new paper.Path.Circle(center, 0.5 * innerDiameter);
        mixerUnit = outerCircle.subtract(innerCircle);
        serp.addChild(mixerUnit);
        //Initial neck
        let neck = new paper.Path.Rectangle(new paper.Point(x - neckLength - channelWidth, y - 0.5 * neckWidth), new paper.Size(neckLength + channelWidth, neckWidth));
        neck.rotate((-1 * neckAngle) / 2, new paper.Point(x, y));
        serp.addChild(neck);
        //Trailing neck
        neck = new paper.Path.Rectangle(new paper.Point(x - neckLength - channelWidth, y - 0.5 * neckWidth + diameter), new paper.Size(neckLength + channelWidth, neckWidth));
        neck.rotate(neckAngle / 2, new paper.Point(x, y + diameter));
        serp.addChild(neck);

        let y_val;
        let x_centerAnalog;
        let y_centerAnalog;
        let centerAnalog;
        let y_neckComponent = neckLength * Math.sin((0.5 * neckAngle * Math.PI) / 180);
        let numRepeats = numMixers - 1;
        for (let i = 1; i <= numRepeats; i++) {
            y_val = y + i * diameter - (i - 1) * y_neckComponent;
            if (i % 2 == 1) {
                x_centerAnalog = x + (channelWidth + 0.5 * innerDiameter) * Math.cos((0.5 * neckAngle * Math.PI) / 180);
                y_centerAnalog = y_val + Math.abs((channelWidth + 0.5 * innerDiameter) * Math.sin((0.5 * neckAngle * Math.PI) / 180));
                centerAnalog = new paper.Point(x_centerAnalog, y_centerAnalog);
                //Add next ring
                outerCircle = new paper.Path.Circle(centerAnalog, 0.5 * innerDiameter + channelWidth);
                innerCircle = new paper.Path.Circle(centerAnalog, 0.5 * innerDiameter);
                mixerUnit = outerCircle.subtract(innerCircle);
                serp.addChild(mixerUnit);
                //Complete inter-ring connection
                let neck = new paper.Path.Rectangle(new paper.Point(x, y_val - 0.5 * neckWidth), new paper.Size(channelWidth, neckWidth));
                neck.rotate(neckAngle / 2, new paper.Point(x, y_val));
                serp.addChild(neck);
                //Add trailing neck
                neck = new paper.Path.Rectangle(
                    new paper.Point(x - neckLength, y_val - 0.5 * neckWidth + (2 * channelWidth + innerDiameter) * Math.sin((0.5 * neckAngle * Math.PI) / 180)),
                    new paper.Size(neckLength + channelWidth, neckWidth)
                );
                neck.rotate((-1 * neckAngle) / 2, new paper.Point(x, y_val + (2 * channelWidth + innerDiameter) * Math.sin((0.5 * neckAngle * Math.PI) / 180)));
                serp.addChild(neck);
            } else {
                y_centerAnalog = y_val + Math.abs((channelWidth + 0.5 * innerDiameter) * Math.sin((0.5 * neckAngle * Math.PI) / 180));
                centerAnalog = new paper.Point(x_center, y_centerAnalog);
                //Add next ring
                outerCircle = new paper.Path.Circle(centerAnalog, 0.5 * innerDiameter + channelWidth);
                innerCircle = new paper.Path.Circle(centerAnalog, 0.5 * innerDiameter);
                mixerUnit = outerCircle.subtract(innerCircle);
                serp.addChild(mixerUnit);
                //Complete inter-ring connection
                let neck = new paper.Path.Rectangle(
                    new paper.Point(x - channelWidth - neckLength * Math.cos((0.5 * neckAngle * Math.PI) / 180), y_val - 0.5 * neckWidth),
                    new paper.Size(channelWidth, neckWidth)
                );
                neck.rotate((-1 * neckAngle) / 2, new paper.Point(x - neckLength * Math.cos((0.5 * neckAngle * Math.PI) / 180), y_val));
                serp.addChild(neck);
                //Add trailing neck
                neck = new paper.Path.Rectangle(
                    new paper.Point(x - neckLength - channelWidth, y_val - 0.5 * neckWidth + diameter - neckLength * Math.sin((0.5 * neckAngle * Math.PI) / 180)),
                    new paper.Size(neckLength + channelWidth, neckWidth)
                );
                neck.rotate(neckAngle / 2, new paper.Point(x, y_val + diameter - neckLength * Math.sin((0.5 * neckAngle * Math.PI) / 180)));
                serp.addChild(neck);
            }
        }

        serp.fillColor = color;
        return serp.rotate(rotation, x, y);
    }

    render2DTarget(key, params) {
        const render = this.render2D(params, key);
        render.fillColor.alpha = 0.5;
        return render;
    }
}
