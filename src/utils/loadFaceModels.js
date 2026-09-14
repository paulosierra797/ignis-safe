// utils/loadFaceModels.js
import * as faceapi from '@vladmandic/face-api';

let faceModelsPromise = null;

export const loadFaceModels = async () => {
  if (!faceModelsPromise) {
    faceModelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models')
    ]).catch((error) => {
      faceModelsPromise = null;
      throw error;
    });
  }

  await faceModelsPromise;
};
