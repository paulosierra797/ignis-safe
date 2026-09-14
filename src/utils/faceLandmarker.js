// utils/faceLandmarker.js
// Loads MediaPipe Face Landmarker for the liveness stage only. Identity matching
// still runs through @vladmandic/face-api (see loadFaceModels.js) - the two
// never run at the same time, so there is no added steady-state cost.
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

// Keep both runtime and model on the same origin. Production's Content Security
// Policy allows only same-origin scripts, and a blocked CDN loader previously
// caused Face ID registration to fail after the camera had already opened.
const WASM_BASE_URL = '/mediapipe/wasm';
const MODEL_ASSET_URL = '/models/face_landmarker.task';

let landmarkerPromise = null;

const createLandmarker = async (delegate) => {
  const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
  return FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: MODEL_ASSET_URL,
      delegate
    },
    runningMode: 'VIDEO',
    numFaces: 2, // lets us positively detect multi-face presentation attacks
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true
  });
};

export const loadFaceLandmarker = () => {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker('GPU').catch((gpuError) => {
      console.warn('FaceLandmarker GPU delegate failed, falling back to CPU:', gpuError);
      return createLandmarker('CPU');
    }).catch((error) => {
      landmarkerPromise = null;
      throw error;
    });
  }
  return landmarkerPromise;
};
