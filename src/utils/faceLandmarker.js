// utils/faceLandmarker.js
// Loads MediaPipe Face Landmarker for the liveness stage only. Identity matching
// still runs through @vladmandic/face-api (see loadFaceModels.js) - the two
// never run at the same time, so there is no added steady-state cost.
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

// Pinned to a specific package/model version (not "@latest") so behavior can't
// shift under us on a future MediaPipe release.
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

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
