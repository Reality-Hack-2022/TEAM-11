// FootController.js
// Version: 1.0.0
// Event: On Awake
// Description: Setups the given ML components

// @input bool advanced = true
// @ui {"widget":"group_start", "label":"Settings", "showIf" : "advanced"}
// @input Component.MLComponent mlComponent
// @input Asset.Texture deviceTexture
// @input Component.Camera camera
// @input SceneObject leftShoe
// @input SceneObject rightShoe
// @input bool onePair = false
// @input SceneObject hintObject
// @ui {"widget":"group_end"}


var modelConfig = {
    stride: 8, // RATIO OF INPUT SIZE TO OUTPUT SIZE

    inputImageWidth: 0, // WIDTH OF THE ORIGINAL IMAGE (FROM THE DEVICE)
    inputImageHeight: 0, // HEIGHT OF THE ORIGINAL IMAGE (FROM THE DEVICE)

    inputWidth: 0, // WIDTH OF THE MODEL INPUT
    inputHeight: 0, // HEIGHT OF THE MODEL INPUT

    heatmapWidth: 0, // WIDTH OF THE MODEL OUTPUT
    heatmapHeight: 0, // HEIGHT OF THE MODEL OUTPUT

    // INTRINSICS
    transformed_intrinsics: [],  // the intrinsics we get when transforming to the cropped image
    // [f_x, f_y, c_x, c_y]

    inputName : "IMAGE", //"images",
    outputSegmentationName : "MP_SG",                                   // 64x64x1
    outputDisparityName : "MP_DISPARITY",                               // 64x64x1
    outputCenterClassName : "MP_CENTER_CLASS",                          // 64x64x1
    outputCenterShortOffsetsName : "MP_CENTER_SHORT_OFFSET",            // 64x64x2
    outputSparseLRClassName : "MP_SPARSE_LR_CLASS",                     // 64x64x1
    outputGlobalTranslationName : "MP_PARAMETRIC_GLOBAL_TRANSLATION",   // 64x64x4
    outputGlobalRotationName : "MP_PARAMETRIC_GLOBAL_ROTATION",         // 64x64x12

    // FOR RECURRENT MODEL
    inputFeaturesWeightName: "FEATURES_WEIGHT",             // 1x1x128
    inputStateWeightName: "STATE_WEIGHT",                   // 1x1x128
    inputStateName: "STATE",                                // 64x64x128
    outputFeaturesName: "FEATURES",                         // 64x64x128
    numFeatureLayerChannels: 128,
    momentum: 0.3,


    minDetectionScore: 0.5,   // minimum detection score used by default in CenterDecoder
    nms_radius: 20,           // nms radius used by default in CenterDecoder

    // For tracking
    memory_cliff: 0,    // CAREFUL WITH THIS PARAMETER. THE OLD DETECTIONS WILL BE KEPT, BUT ".matched"
    // SHOULD BE CHECKED SO THAT THEY ARE NOT DISPLAYED. IF NOT SURE, JUST SET TO 0.
    next_id: 0,
    tracking_radius: 20,
    min_track_length: 1,

    // For hysteresis
    hysteresis_enabled: true,
    hysteresis_ub: 0.7,

    // For 1euro filters:
    oneEuro2d_enabled: true,
    oneEuro3d_enabled: true,
    oneEuroRotation_enabled: true,
    freq: 20,
    mincutoff_2D: 0.05,
    beta_2D: 0.1,
    dcutoff_2D: 1.0,

    mincutoff_XY: 0.1,
    beta_XY: 0.9,
    dcutoff_XY: 10.0,

    mincutoff_Z: 1,
    beta_Z: 1,
    dcutoff_Z: 1.0,

    mincutoff_Rot: 2,
    beta_Rot: 2,
    dcutoff_Rot: 3,

    only_onePair: script.onePair,
    maximumNumFeet: 6,
};

global.centers = [];
var listOfInstantiatedObjects = [];

var mlComponent = null;
var modelInput = null;
var modelOutput = null;

var camera_intrinsics = null;
var camera_size = null;

var footDecoder = null;

//UPDATE EVENT (gets enabled after model is loaded)
var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(onUpdate);
updateEvent.enabled = false;

// Detection triggers
var feetFound = false;
var tweenExist = false;

function updateDimensionVariablesAndTransform() {
    modelConfig.inputImageWidth = script.deviceTexture.getWidth();
    modelConfig.inputImageHeight = script.deviceTexture.getHeight();

    modelConfig.stride = Math.round(modelConfig.inputWidth / modelConfig.heatmapWidth);
    // HAVING COMPUTED THE DIMENSION VARIABLES, CALCULATE THE TRANSFORM FROM
    // THE DEVICE IMAGE COORDINATES TO THE HEATMAP COORDINATES
    var transform_DEV2TEX = global.get_transform(modelConfig.inputImageWidth, modelConfig.inputImageHeight, modelConfig.inputWidth, modelConfig.inputHeight);
    var basic_intrinsics = [camera_intrinsics.column0.x,   // f_x
        camera_intrinsics.column1.y,   // f_y
        camera_intrinsics.column0.z,   // c_x
        camera_intrinsics.column1.z];   // c_y
    modelConfig.transformed_intrinsics = global.transform_intrinsics(transform_DEV2TEX, basic_intrinsics);
}

function init() {
    if (!checkAllInputSet()) {
        return;
    }

    initCamera();
    debugPrint("Global cameraSize" + camera_size, 2);
    debugPrint("Global intrinsics" + camera_intrinsics, 2);

    debugPrint("hysteresis: " + modelConfig.hysteresis_enabled, 2);
    debugPrint("oneEuro2d: " + modelConfig.oneEuro2d_enabled, 2);
    debugPrint("oneEuro3d: " + modelConfig.oneEuro3d_enabled, 2);
    debugPrint("oneEuroRotation: " + modelConfig.oneEuroRotation_enabled, 2);

    initMLComponent();

    footDecoder = new global.FootDecoder(modelConfig);

    tweenExist = global.tweenManager.findTween(script.hintObject, "hide_hint");
}


function initCamera() {
    camera_size = new global.MathLib.vec2(script.camera.renderTarget.getHeight(), script.camera.renderTarget.getWidth());
    camera_intrinsics = global.MathLib.makeIntrinsicsMatrix(camera_size, script.camera.fov);
}

function updateShoes(detections, eventData) {
    if (modelConfig.only_onePair) {
        script.leftShoe.enabled = false;
        script.rightShoe.enabled = false;
    } else {
        for (var objectIdx = listOfInstantiatedObjects.length - 1; objectIdx >= 0; objectIdx--) {
            listOfInstantiatedObjects[objectIdx].destroy();
            listOfInstantiatedObjects.splice(objectIdx, 1);
        }
    }
    global.centers = [];
    for (var i = 0; i < detections.length; i++) {
        var translation = detections[i].translation;
        var quat = detections[i].quat;
        var is_right = detections[i].is_right;

        /**
         * ONLY MATCHED SHOES THAT APPEAR FOR MORE THAN THE MINIMUM TRACK LENGTH ARE DISPLAYED.
         * IF THE RELEVANT CHECKBOX IS TICKED, THEN ALSO ONLY ONE PAIR OF SHOES IS DISPLAYED.
         */
        if (detections[i].track_duration > modelConfig.min_track_length &&
            detections[i].matched &&
            (detections[i].selectedPair || !modelConfig.only_onePair)) {

            global.centers.push(detections[i]);

            var shoeObject;
            if (modelConfig.only_onePair) {
                shoeObject = (is_right) ? script.rightShoe : script.leftShoe;
            } else {
                var sceneObject = script.getSceneObject();
                shoeObject = (is_right) ? sceneObject.copyWholeHierarchy(script.rightShoe) : sceneObject.copyWholeHierarchy(script.leftShoe);
                shoeObject.setParent(script.camera.getSceneObject());
                listOfInstantiatedObjects.push(shoeObject);
            }
            shoeObject.enabled = true;
            var shoeObjectTF = shoeObject.getTransform();
            shoeObjectTF.setLocalPosition(translation);
            shoeObjectTF.setLocalRotation(quat);
        }
    }
}



function initMLComponent() {
    mlComponent = script.mlComponent;
    mlComponent.onLoadingFinished = onLoaded;
    mlComponent.inferenceMode = MachineLearning.InferenceMode.Auto;
    mlComponent.waitOnLoading();
}


function onLoaded() {
    /**
     * This funcion is executed after the ML component is loaded and assigns all the model outputs
     * to the modelOutput dictionary. The input and output dimensions are updated as well.
     */

    modelInput = {
        input: mlComponent.getInput(modelConfig.inputName)
    };

    modelInput.input.texture = script.deviceTexture;
    var outputShape = mlComponent.getOutput(modelConfig.outputDisparityName).shape;

    modelConfig.inputWidth = modelInput.input.shape.x;
    modelConfig.inputHeight = modelInput.input.shape.y;
    modelConfig.heatmapWidth = outputShape.x;
    modelConfig.heatmapHeight = outputShape.y;
    updateDimensionVariablesAndTransform();

    modelOutput = {
        // 64x64x1
        outputDisparityTensor: mlComponent.getOutput(modelConfig.outputDisparityName).data,
        // 64x64x1
        outputCenterClassTensor: mlComponent.getOutput(modelConfig.outputCenterClassName).data,
        // 64x64x2
        outputCenterShortOffsetsTensor: mlComponent.getOutput(modelConfig.outputCenterShortOffsetsName).data,
        // 64x64x1
        outputSparseLRClassTensor: mlComponent.getOutput(modelConfig.outputSparseLRClassName).data,
        // 64x64x4
        outputGlobalTranslationTensor: mlComponent.getOutput(modelConfig.outputGlobalTranslationName).data,
        // 64x64x12
        outputGlobalRotationTensor: mlComponent.getOutput(modelConfig.outputGlobalRotationName).data
    };

    modelInput.inputFeaturesWeightTensor = mlComponent.getInput(modelConfig.inputFeaturesWeightName).data;
    modelInput.inputStateWeightTensor = mlComponent.getInput(modelConfig.inputStateWeightName).data;
    modelInput.inputStateTensor = mlComponent.getInput(modelConfig.inputStateName).data;
    modelOutput.outputFeaturesTensor = mlComponent.getOutput(modelConfig.outputFeaturesName).data;

    var featureTensorShape = mlComponent.getOutput(modelConfig.outputFeaturesName).shape;

    modelConfig.numFeatureLayerChannels = featureTensorShape.z;
    setMomentum(modelConfig.momentum);
    mlComponent.onRunningFinished = onRunningFinished;

    updateEvent.enabled = true;

    initCamera(); // RUN AGAIN, because the image size seems not to have been initialised properly
    updateDimensionVariablesAndTransform();

    mlComponent.runScheduled(true, MachineLearning.FrameTiming.Update, MachineLearning.FrameTiming.Update);
}

function setMomentum(momentum) {
    global.setArrayToScalar(modelInput.inputStateWeightTensor, momentum);
    global.setArrayToScalar(modelInput.inputFeaturesWeightTensor, 1 - momentum);
}


function onUpdate(eventData) {
    /**
     * CALLING FUNCTION decode_feet THAT DETECTS
     */
    var centers = footDecoder.decode_feet(modelOutput);
    if (centers && centers.length == 2 && !feetFound && global.behaviorSystem) {
        global.behaviorSystem.sendCustomTrigger("LEFT_FOOT_FOUND");
        global.behaviorSystem.sendCustomTrigger("RIGHT_FOOT_FOUND");
        if (tweenExist) {
            global.tweenManager.startTween(script.hintObject, "hide_hint");
        }
        feetFound = true;
    }

    /**
     * DISPLAYING 3D SHOE MODELS
     */
    updateShoes(centers, eventData);
}

function onRunningFinished() {
    /**
     COPY OUTPUT FEATURE TENSOR TO INPUT OF THE RECURRENT MODEL
     (MUCH FASTER USING TENSORMATH INSTEAD OF A FOR LOOP)
     */
    TensorMath.addScalar(modelOutput.outputFeaturesTensor, 0, modelInput.inputStateTensor);
}

function checkAllInputSet() {
    if (!script.mlComponent) {
        debugPrint("Error: Please assign an ML Component which has a proxy texture output");
        return false;
    }

    if (script.onePair) {
        debugPrint("Only one pair of feet will be displayed!", 2);
    } else {
        debugPrint("Multiple pairs of feet will be displayed!", 2);
    }

    return true;
}


init();
