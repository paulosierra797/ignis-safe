// utils/loadFaceModels.js
import * as faceapi from '@vladmandic/face-api';

export const loadFaceModels = async () => {
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
  await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
};
