// import ZoomToolBar from "@/components/zoomSlider.vue";
import BorderSettingsDialog from "./ui/borderSettingDialog";
import paper from "paper";

import Registry from "../core/registry";
import * as Colors from "./colors";
import { saveAs } from "file-saver";

import Device from "../core/device";
import ChannelTool from "./tools/channelTool";
import SelectTool from "./tools/selectTool";
import InsertTextTool from "./tools/insertTextTool";
import SimpleQueue from "../utils/simpleQueue";
import MouseSelectTool from "./tools/mouseSelectTool";
import RenderMouseTool from "./tools/renderMouseTool";

import DXFObject from "../core/dxfObject";
import EdgeFeature from "../core/edgeFeature";
import * as HTMLUtils from "../utils/htmlUtils";
import MouseAndKeyboardHandler from "./mouseAndKeyboardHandler";
import { inactiveBackground, inactiveText, activeText } from "./ui/componentToolBar";
import DesignHistory from "./designHistory";
import MoveTool from "./tools/moveTool";
import ComponentPositionTool from "./tools/componentPositionTool";
import MultilayerPositionTool from "./tools/multilayerPositionTool";
import MultilevelPositionTool from "./tools/multilevelPositionTool";
import CellPositionTool from "./tools/cellPositionTool";
import ValveInsertionTool from "./tools/valveInsertionTool";
import PositionTool from "./tools/positionTool";
import ConnectionTool from "./tools/connectionTool";
import GenerateArrayTool from "./tools/generateArrayTool";
import CustomComponentPositionTool from "./tools/customComponentPositionTool";
import CustomComponent from "../core/customComponent";
import { setButtonColor } from "../utils/htmlUtils";
import PaperView from "./paperView";
import AdaptiveGrid from "./grid/adaptiveGrid";
import DAFDPlugin from "../plugin/dafdPlugin";
import { Examples } from "../index";
import Layer from "../core/layer";
import ControlCellPositionTool from "./tools/controlCellPositionTool";
import EventBus from "@/events/events";
import { ComponentAPI } from "@/componentAPI";
import RenderLayer from "@/app/view/renderLayer";

import LoadUtils from "@/app/utils/loadUtils";
import ExportUtils from "@/app/utils/exportUtils";
import { DeviceInterchangeV1, DeviceInterchangeV1_1, LogicalLayerType, Point, ScratchInterchangeV1 } from "@/app/core/init";
import Feature from "../core/feature";
import connection from "../core/connection";
import component from "../core/component";
import UIElement from "./uiElement";
import Params from "../core/params";
import MouseTool from "./tools/mouseTool";


export default class ViewManager {
    view: PaperView;
    __grid: AdaptiveGrid;
    renderLayers: Array<RenderLayer>;
    activeRenderLayer: number;
    nonphysElements: UIElement[];
    tools: { [key: string]: MouseTool };
    rightMouseTool: SelectTool;
    __currentDevice: Device | null;
    updateQueue: SimpleQueue;
    saveQueue: SimpleQueue;
    undoStack: DesignHistory;
    pasteboard: Array<any>;
    mouseAndKeyboardHandler: MouseAndKeyboardHandler;
    minZoom: number;
    maxZoom: number;
    threeD: boolean;
    renderer: null;
    currentSelection: Array<any> = [];
    messageBox: any;
    customComponentManager: any;

    /**
     * Default ViewManger Constructor
     */
    constructor() {
        this.view = new PaperView("c", this);
        this.__grid = new AdaptiveGrid(this);
        Registry.currentGrid = this.__grid;
        this.renderLayers = [];
        this.activeRenderLayer = -1;
        this.nonphysElements = []; // TODO - Keep track of what types of objects fall here UIElements
        this.tools = {};
        this.rightMouseTool = new SelectTool();
        this.__currentDevice = null;
        const reference = this;
        this.updateQueue = new SimpleQueue(function () {
            reference.view.refresh();
        }, 20);

        this.saveQueue = new SimpleQueue(function () {
            reference.saveToStorage();
        });

        this.undoStack = new DesignHistory();
        this.pasteboard = [];

        this.mouseAndKeyboardHandler = new MouseAndKeyboardHandler(this);

        this.view.setResizeFunction(function () {
            reference.updateGrid();
            reference.updateAlignmentMarks();

            reference.view.updateRatsNest();
            reference.view.updateComponentPortsRender();
            if(reference.currentDevice === null){
                throw new Error("View manager has no current device set");
            }
            reference.updateDeviceRender();
        });

        const func = function (event: WheelEvent) {
            reference.adjustZoom(event.deltaY, reference.getEventPosition(event));
        };

        // this.manufacturingPanel = new ManufacturingPanel(this);

        // this.exportPanel = new ExportPanel(this);

        this.view.setMouseWheelFunction(func);
        this.minZoom = 0.0001;
        this.maxZoom = 5;
        this.setupTools();
        const ref = this;
        EventBus.get().on(EventBus.UPDATE_RENDERS, function (feature, refresh = true) {
            if (ref.ensureFeatureExists(feature)) {
                ref.view.updateFeature(feature);
                ref.refresh(refresh);
            }
        });

        // TODO: Figure out how remove UpdateQueue as dependency mechanism
        this.__grid.setColor(Colors.BLUE_500);

        // Removed from Page Setup
        this.threeD = false;
        this.renderer = Registry.threeRenderer;
        // this.__button2D = document.getElementById("button_2D");
        // this.__canvasBlock = document.getElementById("canvas_block");
        // this.__renderBlock = document.getElementById("renderContainer");
        this.setupDragAndDropLoad("#c");
        this.setupDragAndDropLoad("#renderContainer");
        // this.switchTo2D();
    }

    /**
     * Returns the current device the ViewManager is displaying. Right now I'm using this to replace the
     * Registry.currentDevice dependency, however this might change as the modularity requirements change.
     *
     * @return {Device}
     * @memberof ViewManager
     */
    get currentDevice() {
        return this.__currentDevice;
    }

    /**
     * Initiates the copy operation on the selected feature
     * @returns {void}
     * @memberof ViewManager
     */
    initiateCopy() {
        const selectedFeatures = this.view.getSelectedFeatures();
        if (selectedFeatures.length > 0) {
            this.pasteboard[0] = selectedFeatures[0];
        }
    }

    /**
     * Sets the initial state of the name map
     * @memberof ViewManager
     * @returns {void}
     */
    setNameMap() {
        if(this.currentDevice === null){
            throw new Error("No device set on current device");
        }
        const newMap = new Map();
        for (let i = 0; i < this.currentDevice.layers.length; i++) {
            const [nameStr, nameNum] = this.currentDevice.layers[i].name.split("_");
            if (newMap.has(nameStr)) {
                if (newMap.get(nameStr) < nameNum) newMap.set(nameStr, parseInt(nameNum));
            } else {
                newMap.set(nameStr, parseInt(nameNum));
            }
        }
        for (let i = 0; i < this.currentDevice.connections.length; i++) {
            const [nameStr, nameNum] = this.currentDevice.connections[i].name.split("_");
            if (newMap.has(nameStr)) {
                if (newMap.get(nameStr) < nameNum) newMap.set(nameStr, parseInt(nameNum));
            } else {
                newMap.set(nameStr, parseInt(nameNum));
            }
        }
        for (let i = 0; i < this.currentDevice.components.length; i++) {
            const [nameStr, nameNum] = this.currentDevice.components[i].name.split("_");
            if (newMap.has(nameStr)) {
                if (newMap.get(nameStr) < nameNum) newMap.set(nameStr, parseInt(nameNum));
            } else {
                newMap.set(nameStr, parseInt(nameNum));
            }
        }
        for (let i = 0; i < this.renderLayers.length; i++) {
            const [nameStr, nameNum] = this.renderLayers[i].name.split("_");
            if (newMap.has(nameStr)) {
                if (newMap.get(nameStr) < nameNum) newMap.set(nameStr, parseInt(nameNum));
            } else {
                newMap.set(nameStr, parseInt(nameNum));
            }
        }

        this.currentDevice.nameMap = newMap;
    }

    /**
     * Adds a device to the view manager
     * @param {Device} device Device to be added
     * @param {Boolean} refresh Default true
     * @memberof ViewManager
     * @returns {void}
     */
    addDevice(device: Device, refresh = true) {
        this.__currentDevice = device;
        this.view.addDevice(device);
        this.__addAllDeviceLayers(device, false);
        this.refresh(refresh);
    }

    /**
     * Adds all the layers in the device
     * @param {Device} device Selected device
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @memberof ViewManager
     * @returns {void}
     * @private
     */
    __addAllDeviceLayers(device: { layers: string | any[]; }, refresh = true) {
        for (let i = 0; i < device.layers.length; i++) {
            const layer = device.layers[i];
            this.addLayer(layer, i, false);
        }
    }

    /**
     * Removes all layers in the device
     * @param {Device} device Selected device
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @memberof ViewManager
     * @returns {void}
     */
    __removeAllDeviceLayers(device: Device, refresh = true) {
        for (let i = 0; i < device.layers.length; i++) {
            const layer = device.layers[i];
            this.removeLayer(layer, i, false);
        }
    }

    /**
     * Removes the device from the view
     * @param {Device} device Selected device to remove
     * @param {Boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    removeDevice(device: Device, refresh: boolean = true) {
        this.view.removeDevice();
        this.__removeAllDeviceLayers(device, false);
        this.refresh(refresh);
    }

    /**
     * Updates the device in the view
     * @param {Device} device Selected device to update
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    updateDeviceRender(refresh = true) {
        if(this.currentDevice === null){
            throw new Error("No device set on current device");
        }
        this.view.updateDevice(this.currentDevice);
        this.refresh(refresh);
    }

    /**
     * Adds a feature to the view
     * @param {Feature} feature Feature to add
     * @param {Boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    addFeature(feature: Feature, index = this.activeRenderLayer, isPhysicalFlag = true, refresh = true) {
        // let isPhysicalFlag = true;
        this.renderLayers[index].addFeature(feature, isPhysicalFlag);
        if (this.ensureFeatureExists(feature)) {
            this.view.addFeature(feature);
            this.refresh(refresh);
        }
    }

    /**
     * Returns the component identified by the id
     * @param {string} id ID of the feature to get the component
     * @return {UIElement|null}
     * @memberof ViewManager
     */
    getNonphysElementFromFeatureID(id: string) {
        for (const i in this.nonphysElements) {
            const element = this.nonphysElements[i];
            // go through each component's features
            for (const j in element.featureIDs) {
                if (element.featureIDs[j] === id) {
                    return element;
                }
            }
        }

        return null;
    }

    /**
     * Updates a feature from the view
     * @param {Feature} feature Feature to update
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    updateFeature(feature: Feature, refresh = true) {
        if (this.ensureFeatureExists(feature)) {
            this.view.updateFeature(feature);
            this.refresh(refresh);
        }
    }

    /**
     * Removes feature from the view
     * @param {Feature} feature Feature to remove
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    removeFeature(feature: Feature, refresh = true) {
        const layer = this.getRenderLayerByID(feature.ID);
        if (this.ensureFeatureExists(feature)) {
            this.view.removeFeature(feature);
            this.refresh(refresh);
        }
        layer.removeFeatureByID(feature.ID);
    }

    /**
     * Removes feature from the view
     * @param {string} feature Feature to remove
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    removeFeatureByID(featureID: string, refresh = true) {
        const layer = this.getRenderLayerByID(featureID);
        const feature = layer.getFeature(featureID);
        if (this.ensureFeatureExists(feature)) {
            this.view.removeFeature(feature);
            this.refresh(refresh);
        }
        layer.removeFeatureByID(featureID);
    }

    /**
     * Adds layer to the view
     * @param {Layer} layer Layer to add
     * @param {Number} index Index of the layer
     * @param {Boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    addLayer(layer: Layer, index: number, refresh = true) {
        if (this.__isLayerInCurrentDevice(layer)) {
            this.view.addLayer(layer, index);
            this.__addAllLayerFeatures(layer, index, false);
            this.refresh(refresh);
        }
    }

    /**
     * Create a new set of layers (flow, control and cell) for the upcoming level.
     * @returns {void}
     * @memberof ViewManager
     */
    createNewLayerBlock() {
        if (this.currentDevice === null){
            throw new Error("No device set");
        }
        // Generate model layers
        let groupNum = this.currentDevice.layers.length;
        if (groupNum != 0) groupNum = groupNum / 3;

        const newlayers = [];
        newlayers[0] = new Layer({ z_offset: 0, flip: false }, this.currentDevice.generateNewName("LayerFlow"), LogicalLayerType.FLOW, groupNum.toString(), this.currentDevice);
        newlayers[1] = new Layer({ z_offset: 0, flip: false }, this.currentDevice.generateNewName("LayerControl"), LogicalLayerType.CONTROL, groupNum.toString(), this.currentDevice);
        newlayers[2] = new Layer({ z_offset: 0, flip: false }, this.currentDevice.generateNewName("LayerIntegration"), LogicalLayerType.INTEGRATION, groupNum.toString(), this.currentDevice);
        // Add model layers to current device
        this.currentDevice.createNewLayerBlock(newlayers);

        // Find all the edge features
        const edgefeatures = [];
        const devicefeatures = this.currentDevice.layers[0].features;
        let feature;

        for (const i in devicefeatures) {
            feature = devicefeatures[i];
            if (feature.fabType === "EDGE") {
                edgefeatures.push(feature);
            }
        }

        // Add the Edge Features from layer '0'
        // to all other layers
        for (const i in newlayers) {
            for (const j in edgefeatures) {
                newlayers[i].addFeature(edgefeatures[j]);
            }
        }

        // Added the new layers
        for (const i in newlayers) {
            const layertoadd = newlayers[i];
            const index = this.view.paperLayers.length;
            this.addLayer(layertoadd, index, true);
        }

        // Add new renderLayers
        this.renderLayers[this.renderLayers.length] = new RenderLayer(this.currentDevice.generateNewName("RenderLayerFlow"), newlayers[0], LogicalLayerType.FLOW);
        this.renderLayers[this.renderLayers.length] = new RenderLayer(this.currentDevice.generateNewName("RenderLayerControl"), newlayers[1], LogicalLayerType.CONTROL);
        this.renderLayers[this.renderLayers.length] = new RenderLayer(this.currentDevice.generateNewName("RenderLayerIntegration"), newlayers[2], LogicalLayerType.INTEGRATION);
        for (const i in edgefeatures) {
            this.renderLayers[this.renderLayers.length - 3].addFeature(edgefeatures[i]);
            this.renderLayers[this.renderLayers.length - 2].addFeature(edgefeatures[i]);
            this.renderLayers[this.renderLayers.length - 1].addFeature(edgefeatures[i]);
        }

        this.setActiveRenderLayer(this.renderLayers.length - 3);
    }

    /**
     * Deletes the layers at the level index, we have 3-set of layers so it deletes everything at
     * that level
     * @param {number} levelindex Integer only
     * @returns {void}
     * @memberof ViewManager
     */
    deleteLayerBlock(levelindex: number) {
        if (this.currentDevice === null){
            throw new Error("No device set");
        }
        if (this.activeRenderLayer === null){
            throw new Error("No active render layer set");
        }

        // Delete the levels in the device model
        this.currentDevice.deleteLayer(levelindex * 3);
        this.currentDevice.deleteLayer(levelindex * 3);
        this.currentDevice.deleteLayer(levelindex * 3);

        // Delete levels in render model
        this.renderLayers.splice(levelindex * 3, 3);
        if (this.activeRenderLayer > levelindex * 3 + 2) {
            this.setActiveRenderLayer(this.activeRenderLayer - 3);
        } else if (this.activeRenderLayer < levelindex * 3) {
            console.log("No change");
        } else {
            if (levelindex === 0) {
                if (this.renderLayers.length === 0) {
                    throw new Error("No render layers remaining, cannt set active render layer");
                } else {
                    this.setActiveRenderLayer(0);
                }
            } else {
                this.setActiveRenderLayer((levelindex - 1) * 3);
            }
        }

        // Delete the levels in the render model
        this.view.removeLayer(levelindex * 3);
        this.view.removeLayer(levelindex * 3);
        this.view.removeLayer(levelindex * 3);
        this.updateActiveLayer();
        this.refresh();
    }

    setActiveRenderLayer(index: number) {
        if (this.activeRenderLayer === null){
            throw new Error("No active render layer set");
        }

        this.activeRenderLayer = index;
        Registry.currentLayer = this.renderLayers[index]; // Registry.currentDevice.layers[index];
        this.updateActiveLayer();
    }

    /**
     * Removes layer from the view
     * @param {Layer} layer Layer to be removed from the view
     * @param {Number} index Index of the layer to remove
     * @param {Boolean} refresh Default to true
     * @returns {view}
     * @memberof ViewManager
     */
    removeLayer(layer: Layer, index: number, refresh = true) {
        if (this.__isLayerInCurrentDevice(layer)) {
            this.view.removeLayer(index);
            this.__removeAllLayerFeatures(layer);
            this.refresh(refresh);
        }
    }

    /**
     * Converts the layers to SVG format
     * @returns {}
     * @memberof ViewManager
     */
    layersToSVGStrings() {
        return this.view.layersToSVGStrings();
    }

    /**
     * Adds all the features of the layer
     * @param {Layer} layer Selected layer
     * @param {Boolean} refresh Default to true
     * @returns {void}
     * @memberof ViewManager
     * @private
     */
    __addAllLayerFeatures(layer: { features: { [x: string]: any; }; }, index: number, refresh = true) {
        for (const key in layer.features) {
            const feature = layer.features[key];
            this.addFeature(feature, index, false);
            this.refresh(refresh);
        }
    }

    /**
     * Updates all the feature of the layer
     * @param {Layer} layer Selected layer
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    __updateAllLayerFeatures(layer: { features: { [x: string]: any; }; }, refresh = true) {
        for (const key in layer.features) {
            const feature = layer.features[key];
            this.updateFeature(feature, false);
            this.refresh(refresh);
        }
    }

    /**
     * Removes all feature of the layer
     * @param {Layer} layer Selected layer
     * @param {Boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    __removeAllLayerFeatures(layer: { features: { [x: string]: any; }; }, refresh = true) {
        for (const key in layer.features) {
            const feature = layer.features[key];
            this.removeFeature(feature, false);
            this.refresh(refresh);
        }
    }

    /**
     * Updates the active layer
     * @param {Boolean} refresh Default to true
     * @returns {void}
     * @memberof ViewManager
     */
    updateActiveLayer(refresh = true) {
        if (this.activeRenderLayer === null){
            throw new Error("No active render layer set");
        }

        this.view.setActiveLayer(this.activeRenderLayer);
        this.refresh(refresh);
    }

    /**
     * Removes the grid
     * @param {Boolean} refresh Default to true
     * @returns {void}
     * @memberof ViewManager
     */
    removeGrid(refresh = true) {
        if (this.__hasCurrentGrid()) {
            this.view.removeGrid();
            this.refresh(refresh);
        }
    }

    /**
     * Update grid
     * @param {Boolean} refresh Default to true
     * @returns {void}
     * @memberof ViewManager
     */
    updateGrid(refresh = true) {
        if(Registry.currentGrid === null){
            throw new Error("No current grid set");
        }
        if (this.__hasCurrentGrid()) {
            this.view.updateGrid(Registry.currentGrid);
            this.refresh(refresh);
        }
    }

    /**
     * Update the alignment marks of the view
     * @returns {void}
     * @memberof ViewManager
     */
    updateAlignmentMarks() {
        this.view.updateAlignmentMarks();
    }

    /**
     * Clear the view
     * @returns {void}
     * @memberof ViewManager
     */
    clear() {
        this.view.clear();
    }

    /**
     * Sets a specific value of zoom
     * @param {Number} zoom Zoom value
     * @param {boolean} refresh Whether it will refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    setZoom(zoom: number, refresh = true) {
        if(this.currentDevice === null){
            throw new Error("Current device set to null !");
        }
        if (zoom > this.maxZoom) zoom = this.maxZoom;
        else if (zoom < this.minZoom) zoom = this.minZoom;
        this.view.setZoom(zoom);
        this.updateGrid(false);
        this.updateAlignmentMarks();
        this.view.updateRatsNest();
        this.view.updateComponentPortsRender();

        this.updateDeviceRender(false);
        this.__updateViewTarget(false);
        this.refresh(refresh);
    }

    /**
     * Automatically generates a rectangular border for the device
     * @returns {void}
     * @memberof ViewManager
     */
    generateBorder() {
        if(this.currentDevice === null){
            throw new Error("Current device set to null !");
        }

        const borderfeature = new EdgeFeature(null, null);

        // Get the bounds for the border feature and then update the device dimensions
        const xspan = this.currentDevice.getXSpan();
        const yspan = this.currentDevice.getYSpan();
        borderfeature.generateRectEdge(xspan, yspan);

        // Adding the feature to all the layers
        for (const i in this.currentDevice.layers) {
            const layer = this.currentDevice.layers[i];
            layer.addFeature(borderfeature);
        }
    }

    /**
     * Accepts a DXF object and then converts it into a feature, an edgeFeature in particular
     * @param dxfobject
     * @returns {void}
     * @memberof ViewManager
     */
    importBorder(dxfobject: { entities: { [x: string]: any; }; }) {
        if(this.currentDevice === null){
            throw new Error("Current device set to null !");
        }

        const customborderfeature = new EdgeFeature({}, null);
        for (const i in dxfobject.entities) {
            const foo = new DXFObject(dxfobject.entities[i]);
            customborderfeature.addDXFObject(foo);
        }

        // Adding the feature to all the layers
        for (const i in this.currentDevice.layers) {
            const layer = this.currentDevice.layers[i];
            layer.addFeature(customborderfeature);
        }

        // Get the bounds for the border feature and then update the device dimensions
        const bounds = this.view.getRenderedFeature(customborderfeature.ID).bounds;

        this.currentDevice.setXSpan(bounds.width);
        this.currentDevice.setYSpan(bounds.height);
        // Refresh the view
        this.view.initializeView();
        this.view.refresh();
    }

    /**
     * Deletes the border
     * @returns {void}
     * @memberof ViewManager
     */
    deleteBorder() {

        if(this.currentDevice === null){
            throw new Error("Current device set to null !");
        }


        /*
        1. Find all the features that are EDGE type
        2. Delete all these features
         */

        console.log("Deleting border...");

        const features = this.currentDevice.getAllFeaturesFromDevice();
        console.log("All features", features);

        const edgefeatures = [];

        for (const i in features) {
            // Check if the feature is EDGE or not
            if (features[i].fabType === "EDGE") {
                edgefeatures.push(features[i]);
            }
        }

        // Delete all the features
        for (const i in edgefeatures) {
            this.currentDevice.removeFeature(edgefeatures[i]);
        }

        console.log("Edgefeatures", edgefeatures);
    }

    /**
     * Removes the target view
     * @memberof ViewManager
     * @returns {void}
     */
    removeTarget() {
        this.view.removeTarget();
    }

    /**
     * Update the target view
     * @param {string} featureType
     * @param {string} featureSet
     * @param {Array<number>} position Array with X and Y coordinates
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    updateTarget(featureType: string | null, featureSet: string, position: paper.Point, currentParameters: any, refresh = true) {
        this.view.addTarget(featureType, featureSet, position, currentParameters);
        this.view.updateAlignmentMarks();
        this.view.updateRatsNest();
        this.refresh(refresh);
    }

    /**
     * Update the view target
     * @param {Boolean} refresh Default to true
     * @returns {void}
     * @memberof ViewManager
     */
    __updateViewTarget(refresh = true) {
        this.view.updateTarget();
        this.updateAlignmentMarks();
        this.view.updateRatsNest();
        this.view.updateComponentPortsRender();
        this.refresh(refresh);
    }

    /**
     * Adjust the zoom value in a certain point
     * @param {Number} delta Value of zoom
     * @param {Array<number>} point Coordinates to zoom in
     * @param {Boolean} refresh Default to true
     * @returns {void}
     * @memberof ViewManager
     */
    adjustZoom(delta: number, point: Point, refresh = true) {
        console.log("Adjusting zoom...", point, delta);
        if(this.currentDevice === null){
            throw new Error("Current device set to null !");
        }


        const belowMin = this.view.getZoom() >= this.maxZoom && delta < 0;
        const aboveMax = this.view.getZoom() <= this.minZoom && delta > 0;
        if (!aboveMax && !belowMin) {
            this.view.adjustZoom(delta, point);
            this.updateGrid(false);
            // this.updateAlignmentMarks();
            this.view.updateRatsNest();
            this.view.updateComponentPortsRender();
            this.updateDeviceRender(false);
            this.__updateViewTarget(false);
        } else {
            // console.log("Too big or too small!");
        }
        this.refresh(refresh);
    }

    /**
     * Sets the center value
     * @param {Array<number>} center Center coordinates
     * @param {Boolean} refresh Default to true
     * @returns {void}
     * @memberof ViewManager
     */
    setCenter(center: paper.Point, refresh = true) {
        if(this.currentDevice === null){
            throw new Error("Current device set to null !");
        }


        this.view.setCenter(center);
        this.updateGrid(false);
        // this.updateAlighmentMarks();

        this.updateDeviceRender();
    }

    /**
     * Moves center by a certain value
     * @param {number} delta
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    moveCenter(delta: paper.Point, refresh = true) {
        if(this.currentDevice === null){
            throw new Error("Current device set to null !");
        }


        this.view.moveCenter(delta);
        this.updateGrid(false);
        // this.updateAlignmentMarks();
        this.view.updateRatsNest();
        this.view.updateComponentPortsRender();
        this.updateDeviceRender(false);
        this.refresh(refresh);
    }

    /**
     * Save the device to JSON format
     * @returns {void}
     * @memberof ViewManager
     */
    saveToStorage() {
        if (Registry.currentDevice) {
            try {
                localStorage.setItem("currentDevice", JSON.stringify(Registry.currentDevice.toJSON()));
            } catch (err) {
                // can't save, so.. don't?
            }
        }
    }

    /**
     * Refresh the view
     * @param {boolean} refresh Whether to refresh or not. true by default
     * @returns {void}
     * @memberof ViewManager
     */
    refresh(refresh = true) {
        if(Registry.currentGrid === null){
            throw new Error("Current grid is set to null !");
        }


        this.updateQueue.run();
        // Update the toolbar
        const spacing = Registry.currentGrid.getSpacing();
        // TODO - undo this
        // this.resolutionToolBar.updateResolutionLabelAndSlider(spacing);
    }

    /**
     * Gets the coordinates of the project
     * @param {*} event
     * @returns {Array<number>} Returns the X and Y coordinates
     * @memberof ViewManager
     */
    getEventPosition(event: MouseEvent): Point {
        let ret = this.view.getProjectPosition(event.clientX, event.clientY);
        return [ret.x, ret.y];
    }

    /**
     * Checks if it has current grid
     * @returns {Boolean}
     * @memberof ViewManager
     */
    __hasCurrentGrid() {
        if (Registry.currentGrid) return true;
        else return false;
    }

    /**
     * Checks if layer is in the current device
     * @param {Layer} layer Layer to check if it's on the current device
     * @returns {Boolean}
     * @memberof ViewManager
     */
    __isLayerInCurrentDevice(layer: { device: Device; }) {
        if (Registry.currentDevice && layer.device === Registry.currentDevice) return true;
        else return false;
    }

    /**
     * Checks if feature is in the current device
     * @param {Object} feature Feature to check if it's on the current device
     * @returns {Boolean}
     * @memberof ViewManager
     */
    isFeatureInCurrentDevice(feature: { layer: any; }) {
        if (Registry.currentDevice && this.__isLayerInCurrentDevice(feature.layer)) return true;
        else return false;
    }

    /**
     * Checks if feature exists
     * @param {Feature} feature Feature to check whether in existence
     * @returns {Boolean}
     * @memberof ViewManager
     */
    ensureFeatureExists(feature: Feature) {
        for (let i = 0; i < this.renderLayers.length; i++) {
            if (this.renderLayers[i].containsFeature(feature)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Loads a device from a JSON format
     * @param {JSON} json
     * @returns {void}
     * @memberof ViewManager
     */
    loadDeviceFromJSON(json: ScratchInterchangeV1) {
        let device;
        this.clear();
        // Check and see the version number if its 0 or none is present,
        // its going the be the legacy format, else it'll be a new format
        const version = json.version;

        if (version === null || undefined === version || version == 1 || version == 1.1 || version == 1.2) {
            const ret = LoadUtils.loadFromScratch(json);
            device = ret[0];
            Registry.currentDevice = device;
            this.addDevice(device);

            this.renderLayers = ret[1];

            this.setNameMap();
            // } else if (version == 1.1 || version == "1.1") {
            //     // this.loadCustomComponents(json);
            //     device = Device.fromInterchangeV1_1(json);
            //     Registry.currentDevice = device;
            //     this.__currentDevice = device;

            //     // TODO: Add separate render layers to initializing json, make fromInterchangeV1_1???
            //     for (const i in json.layers) {
            //         const newRenderLayer = RenderLayer.fromInterchangeV1(json.renderLayers[i]);
            //         this.renderLayers.push(newRenderLayer);
            //     }
            this.updateDeviceRender();

        } else {
            alert("Version '" + version + "' is not supported by 3DuF !");
        }
        // Common Code for rendering stuff
        // console.log("Feature Layers", Registry.currentDevice.layers);
        Registry.currentLayer = this.renderLayers[0];
        // TODO - Deal with this later
        // Registry.currentTextLayer = Registry.currentDevice.textLayers[0];

        this.activeRenderLayer = 0;

        // In case of MINT exported json, generate layouts for rats nests
        this.__initializeRatsNest();

        this.view.initializeView();
        this.updateGrid();
        this.refresh(true);
        Registry.currentLayer = this.renderLayers[0];
        // this.layerToolBar.setActiveLayer("0");
        this.updateActiveLayer();
    }

    /**
     * Removes the features of the current device by searching on it's ID
     * @param {*} paperElements
     * @returns {void}
     * @memberof ViewManager
     */
    removeFeaturesByPaperElements(paperElements: string | any[]) {
        if (this.currentDevice === null){
            throw new Error("No device set in the viewmanager");
        }
        if (paperElements.length > 0) {
            for (let i = 0; i < paperElements.length; i++) {
                const paperFeature = paperElements[i];
                this.currentDevice.removeFeature(paperFeature);
            }
            this.currentSelection = [];
        }
    }

    /**
     * Updates the component parameters of a specific component
     * @param {string} componentname
     * @param {Array} params
     * @returns {void}
     * @memberof ViewManager
     */
    updateComponentParameters(componentname: string, params: { [x: string]: any; }) {
        if (this.currentDevice === null){
            throw new Error("No device set in the viewmanager");
        }

        const component = this.currentDevice.getComponentByName(componentname);
        for (const key in params) {
            component.updateParameter(key, params[key]);
        }
    }

    /**
     * Returns a Point, coordinate list that is the closes grid coordinate
     * @param {Array<number>} point Array with the X and Y coordinates
     * @return {void|Array<number>}
     * @memberof ViewManager
     */
    snapToGrid(point: Point) {
        if (Registry.currentGrid) return Registry.currentGrid.getClosestGridPoint(point);
        else return point;
    }

    /**
     * Gets the features of a specific type ?
     * @param {string} typeString
     * @param {string} setString
     * @param {Array} features Array with features
     * @returns {Array} Returns array with the features of a specific type
     * @memberof ViewManager
     */
    getFeaturesOfType(typeString: any, setString: any, features: string | any[]) {
        const output = [];
        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            if (feature.getType() === typeString && feature.getSet() === setString) {
                output.push(feature);
            }
        }
        return output;
    }

    /**
     * Updates all feature parameters
     * @param {string} valueString
     * @param {*} value
     * @param {Array} features Array of features
     * @returns {void}
     * @memberof ViewManager
     */
    adjustAllFeatureParams(valueString: any, value: any, features: string | any[]) {
        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            feature.updateParameter(valueString, value);
        }
    }

    /**
     * Adjust all parameters of the same type
     * @param {string} typeString
     * @param {string} setString
     * @param {string} valueString
     * @param {*} value
     * @returns {void}
     * @memberof ViewManager
     */
    adjustParams(typeString: any, setString: any, valueString: string, value: any) {
        const selectedFeatures = this.view.getSelectedFeatures();
        if (selectedFeatures.length > 0) {
            const correctType = this.getFeaturesOfType(typeString, setString, selectedFeatures);
            if (correctType.length > 0) {
                this.adjustAllFeatureParams(valueString, value, correctType);
            }

            // Check if any components are selected
            // TODO: modify parameters window to not have chain of updates
            // Cycle through all components and connections and change the parameters
            for (const i in this.view.selectedComponents) {
                this.view.selectedComponents[i].updateParameter(valueString, value);
            }
            for (const i in this.view.selectedConnections) {
                this.view.selectedConnections[i].updateParameter(valueString, value);
            }
        } else {
            this.updateDefault(typeString, setString, valueString, value);
        }
    }

    /**
     * Updates the default feature parameter
     * @param {string} typeString
     * @param {string} setString
     * @param {string} valueString
     * @param value
     * @returns {void}
     * @memberof ViewManager
     */
    updateDefault(typeString: string, setString: null, valueString: string, value: number) {
        // Registry.featureDefaults[setString][typeString][valueString] = value;
        const defaults = ComponentAPI.getDefaultsForType(typeString);
        defaults[valueString] = value;
    }

    /**
     * Updates the defaults in the feature
     * @param {Feature} feature Feature object
     * @returns {void}
     * @memberof ViewManager
     */
    updateDefaultsFromFeature(feature: Feature) {
        const heritable = feature.getHeritableParams();
        for (const key in heritable) {
            this.updateDefault(feature.getType(), null, key, feature.getValue(key));
        }
    }

    /**
     * Reverts the feature to default
     * @param {string} valueString
     * @param {Feature} feature
     * @returns {void}
     * @memberof ViewManager
     */
    revertFieldToDefault(valueString: string, feature: Feature) {
        // feature.updateParameter(valueString, Registry.featureDefaults[feature.getSet()][feature.getType()][valueString]);
        let defaultvalue = ComponentAPI.getDefaultsForType(feature.getType())[valueString];
        feature.updateParameter(valueString, defaultvalue);
    }

    /**
     * Reverts the feature to params to defaults
     * @param {Feature} feature
     * @returns {void}
     * @memberof ViewManager
     */
    revertFeatureToDefaults(feature: Feature) {
        const heritable = feature.getHeritableParams();
        for (const key in heritable) {
            this.revertFieldToDefault(key, feature);
        }
    }

    /**
     * Reverts features to defaults
     * @param {Array} features Features to revert to default
     * @returns {void}
     * @memberof ViewManager
     */
    revertFeaturesToDefaults(features: Array<Feature>) {
        for (const feature of features) {
            this.revertFeatureToDefaults(feature);
        }
    }

    /**
     * Checks if the point intersects with any other feature
     * @param {Array<number>} point Array with the X and Y coordinates
     * @return PaperJS rendered Feature
     * @memberof ViewManager
     */
    hitFeature(point: paper.Point) {
        return this.view.hitFeature(point);
    }

    /**
     * Checks if the point intersects with any other feature
     * @param {string} ID of feature object
     * @return {Feature}
     * @memberof ViewManager
     */
    getFeatureByID(featureID: string) {
        const layer = this.getRenderLayerByID(featureID);
        return layer.getFeature(featureID);
    }

    /**
     * Checks if the point intersects with any other feature
     * @param {string} ID of feature object
     * @return {RenderLayer}
     * @memberof ViewManager
     */
    getRenderLayerByID(featureID: string) {
        for (let i = 0; i < this.renderLayers.length; i++) {
            const layer = this.renderLayers[i];
            if (layer.containsFeatureID(featureID)) {
                return layer;
            }
        }
        // Should textlayer logic be here or in device? (Currently in device)
        // for (let i = 0; i < this.__textLayers.length; i++) {
        //     let layer = this.__textLayers[i];
        //     if (layer.containsFeatureID(featureID)) {
        //         return layer;
        //     }
        // }
        throw new Error("FeatureID " + featureID + " not found in any renderLayer.");
    }

    /**
     * Checks if the element intersects with any other feature
     * @param element
     * @return {*|Array}
     * @memberof ViewManager
     */
    hitFeaturesWithViewElement(element: paper.Path.Rectangle) {
        return this.view.hitFeaturesWithViewElement(element);
    }

    /**
     * Activates the given tool
     * @param {string} toolString
     * @param rightClickToolString
     * @returns {void}
     * @memberof ViewManager
     */
    activateTool(toolString: string, rightClickToolString = "SelectTool") {
        if (this.tools[toolString] === null) {
            throw new Error("Could not find tool with the matching string");
        }
        // Cleanup job when activating new tool
        this.view.clearSelectedItems();

        this.mouseAndKeyboardHandler.leftMouseTool = this.tools[toolString];
        this.mouseAndKeyboardHandler.rightMouseTool = this.tools[rightClickToolString];
        this.mouseAndKeyboardHandler.updateViewMouseEvents();
    }

    __button2D(__button2D: any, arg1: any, activeText: string) {
        throw new Error("Method not implemented.");
    }
    __button3D(__button3D: any, inactiveBackground: string, inactiveText: string) {
        throw new Error("Method not implemented.");
    }
    __renderBlock(__renderBlock: any, arg1: string) {
        throw new Error("Method not implemented.");
    }
    __canvasBlock(__canvasBlock: any, arg1: string) {
        throw new Error("Method not implemented.");
    }

    /**
     * Loads a device from a JSON format when the user drags and drops it on the grid
     * @param selector
     * @returns {void}
     * @memberof ViewManager
     */
    setupDragAndDropLoad(selector: string) {
        const dnd = new HTMLUtils.DnDFileController(selector, function (files: any[]) {
            const f = files[0];

            const reader = new FileReader();
            reader.onloadend = function (e) {
                let result = this.result;

                // Throw error if viewmanager is not initialized
                if (Registry.viewManager === null) {
                    throw new Error("ViewManager not initialized");
                }
                if (typeof result === "string") {
                    let jsonresult = JSON.parse(result);
                    Registry.viewManager.loadDeviceFromJSON(jsonresult);
                }
            };
            try {
                reader.readAsText(f);
            } catch (err) {
                console.log("unable to load JSON: " + f);
            }
        });
    }

    /**
     * Closes the params window
     * @returns {void}
     * @memberof ViewManager
     */
    killParamsWindow() {
        console.warn("Modify killParamsWindow to kill the windows");
        // const paramsWindow = document.getElementById("parameter_menu");
        // if (paramsWindow) paramsWindow.parentElement.removeChild(paramsWindow);
    }

    /**
     * This method saves the current device to the design history
     * @memberof ViewManager
     * @returns {void}
     */
    saveDeviceState() {
        if (this.currentDevice === null){
            throw new Error("No device set in the viewmanager");
        }

        console.log("Saving to stack");

        const save_device = JSON.stringify(this.currentDevice.toInterchangeV1());

        this.undoStack.pushDesign(save_device);
    }

    /**
     * Undoes the recent update
     * @returns {void}
     * @memberof ViewManager
     */
    undo() {
        const previousdesign = this.undoStack.popDesign();
        console.log(previousdesign);
        if (previousdesign) {
            const result = JSON.parse(previousdesign);
            this.loadDeviceFromJSON(result);
        }
    }

    /**
     * Resets the tool to the default tool
     * @returns {void}
     * @memberof ViewManager
     */
    resetToDefaultTool() {
        this.cleanupActiveTools();
        this.activateTool("MouseSelectTool");
        // this.activateTool("RenderMouseTool");
        // this.componentToolBar.setActiveButton("SelectButton");
    }

    /**
     * Runs cleanup method on the activated tools
     * @returns {void}
     * @memberof ViewManager
     */
    cleanupActiveTools() {
        if (this.mouseAndKeyboardHandler.leftMouseTool) {
            this.mouseAndKeyboardHandler.leftMouseTool.cleanup();
        }
        if (this.mouseAndKeyboardHandler.rightMouseTool) {
            this.mouseAndKeyboardHandler.rightMouseTool.cleanup();
        }
    }

    /**
     * Updates the renders for all the connection in the blah
     * @returns {void}
     * @memberof ViewManager
     */
    updatesConnectionRender(connection: connection) {
        if (this.currentDevice === null){
            throw new Error("No device set in the viewmanager");
        }

        // First Redraw all the segements without valves or insertions
        connection.regenerateSegments();

        // Get all the valves for a connection
        const valves = this.currentDevice.getValvesForConnection(connection);
        if(valves.length > 0 && valves !== null){
        // Cycle through each of the valves
            for (const j in valves) {
                const valve = valves[j];
                const is3D = this.currentDevice.getIsValve3D(valve);
                if (is3D) {
                    const boundingbox = valve.getBoundingRectangle();
                    connection.insertFeatureGap(boundingbox);
                }
            }
        }
    }

    /**
     * Shows in the UI a message
     * @param {string} message Messsage to display
     * @returns {void}
     * @memberof ViewManager
     */
    showUIMessage(message: any) {
        this.messageBox.MaterialSnackbar.showSnackbar({
            message: message
        });
    }

    /**
     * Sets up all the tools to be used by the user
     * @returns {void}
     * @memberof ViewManager
     */
    setupTools() {
        this.tools["MouseSelectTool"] = new MouseSelectTool(this, this.view);
        this.tools["RenderMouseTool"] = new RenderMouseTool(this, this.view);
        this.tools["InsertTextTool"] = new InsertTextTool(this);
        // All the new tools
        this.tools["MoveTool"] = new MoveTool();
        this.tools["GenerateArrayTool"] = new GenerateArrayTool();
    }

    /**
     * Adds a custom component tool
     * @param {string} identifier
     * @returns {void}
     * @memberof ViewManager
     */
    addCustomComponentTool(identifier: string ) {
        const customcomponent = this.customComponentManager.getCustomComponent(identifier);
        this.tools[identifier] = new CustomComponentPositionTool(customcomponent, "Custom");
    }

    /**
     * Initialize the default placement for components
     * @returns {void}
     * @memberof ViewManager
     */
    __initializeRatsNest() {
        if (this.currentDevice === null){
            throw new Error("No device set in the viewmanager");
        }

        // Step 1 generate features for all the components with some basic layout
        const components = this.currentDevice.components;
        const xpos = 10000;
        const ypos = 10000;
        for (const i in components) {
            const component = components[i];
            const currentposition = component.getPosition();
            // TODO: Refine this logic, it sucks
            if (currentposition[0] === 0 && currentposition[1] === 0) {
                if (!component.placed) {
                    this.__generateDefaultPlacementForComponent(component, xpos * (parseInt(i) + 1), ypos * (Math.floor(parseInt(i) / 5) + 1));
                }
            } else {
                if (!component.placed) {
                    this.__generateDefaultPlacementForComponent(component, currentposition[0], currentposition[1]);
                }
            }
        }

        // TODO: Step 2 generate rats nest renders for all the components

        this.view.updateRatsNest();
        this.view.updateComponentPortsRender();
    }

    /**
     * Generates the default placement for components
     * @param {Component} component
     * @param {number} xpos Default X coordinate
     * @param {number} ypos Default Y coordinate
     * @returns {void}
     * @memberof ViewManager
     */
    __generateDefaultPlacementForComponent(component: component, xpos: number, ypos: number) {
        if(Registry.currentLayer === null){
            throw new Error("No current layer found!");
        }
        const params_to_copy = component.params.toJSON();

        params_to_copy.position = [xpos, ypos];

        // Get default params and overwrite them with json params, this can account for inconsistencies
        const renderdefkeys = ComponentAPI.getRenderTypeKeysForMINT(component.mint);
        if(renderdefkeys !== null){
            for (let i = 0; i < renderdefkeys.length; i++) {
                const key = renderdefkeys[i];
                const newFeature = Device.makeFeature(key, params_to_copy, component.name, component.id, ComponentAPI.getFabType(component.mint, key), null);
                component.addFeatureID(newFeature.ID);
                Registry.currentLayer.addFeature(newFeature);
            }
        }

        // Set the component position
        component.updateComponentPosition([xpos, ypos]);
    }

    /**
     * Generates a JSON format file to export it
     * @returns {void}
     * @memberof ViewManager
     */
    generateExportJSON() {
        // throw error if the current device is not set
        if (this.currentDevice === null){
            throw new Error("No device set in the viewmanager");
        }
        const json = ExportUtils.toScratch(this.currentDevice, this.renderLayers);
        // const json = this.currentDevice.toInterchangeV1_1();
        // json.customComponents = this.customComponentManager.toJSON();
        return json;
    }

    /**
     * This method attempts to load any custom components that are stored in the custom components property
     * @param json
     */
    loadCustomComponents(json: { customComponents: any; }) {
        if (Object.prototype.hasOwnProperty.call(json, "customComponents")) {
            this.customComponentManager.loadFromJSON(json.customComponents);
        }
    }

    /**
     * Activates DAFD plugin
     * @param {*} params
     * @returns {void}
     * @memberof ViewManager
     */
    activateDAFDPlugin(params = {}) {
        this.loadDeviceFromJSON(JSON.parse(Examples.dafdtemplate));

        if (Object.keys(params).length === 0) {
            params = {
                orificeSize: 750,
                orificeLength: 200,
                oilInputWidth: 800,
                waterInputWidth: 900,
                outputWidth: 900,
                outputLength: 500,
                height: 100
            };
        }

        DAFDPlugin.fixLayout(params);
    }

    deactivateComponentPlacementTool() {
        console.log("Deactivating Component Placement Tool");
        if(this.mouseAndKeyboardHandler.leftMouseTool !== null){
            this.mouseAndKeyboardHandler.leftMouseTool.deactivate();
        }
        if(this.mouseAndKeyboardHandler.rightMouseTool !== null){
            this.mouseAndKeyboardHandler.rightMouseTool.deactivate();
        }
        this.resetToDefaultTool();
    }
}
