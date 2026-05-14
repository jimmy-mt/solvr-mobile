import { Asset } from 'expo-asset';
import { NativeModules } from 'react-native';
import type { InferenceSession, Tensor } from 'onnxruntime-react-native';

import {
  buildSimulatorInputVector,
  roundFrequencies,
  sampleSimulatorAction,
  type ModelDecision,
  type SimGameState,
} from './simulatorEngine';
import type { SeatPosition } from '../components/poker-table/pokerTableTypes';

const MODEL_ASSET = require('../../assets/preflop_merged.onnx');

let sessionPromise: Promise<InferenceSession> | null = null;

export async function decidePreflopAction(state: SimGameState, position: SeatPosition): Promise<ModelDecision> {
  const session = await getSimulatorSession();
  const input = buildSimulatorInputVector(state, position);
  const tensor = await createTensor(input);
  const feeds: Record<string, Tensor> = {
    [session.inputNames[0]]: tensor,
  };
  const results = await session.run(feeds);
  const raw = Array.from(results[session.outputNames[0]].data as Iterable<number>);
  const roundedFrequencies = roundFrequencies(raw);

  return {
    action: sampleSimulatorAction(roundedFrequencies),
    frequencies: [raw[0] ?? 0, raw[1] ?? 0, raw[2] ?? 0, raw[3] ?? 0],
    roundedFrequencies,
    input,
  };
}

export async function warmSimulatorModel() {
  await getSimulatorSession();
}

export function hasSimulatorNativeRuntime() {
  return NativeModules.Onnxruntime != null;
}

async function getSimulatorSession() {
  if (!sessionPromise) {
    sessionPromise = loadSimulatorSession();
  }
  return sessionPromise;
}

async function loadSimulatorSession() {
  assertSimulatorNativeRuntime();
  const { InferenceSession } = await import('onnxruntime-react-native');
  const asset = Asset.fromModule(MODEL_ASSET);
  await asset.downloadAsync();
  const modelPath = asset.localUri ?? asset.uri;
  if (!modelPath) {
    throw new Error('Could not resolve preflop_merged.onnx.');
  }
  return InferenceSession.create(modelPath);
}

async function createTensor(input: Float32Array) {
  assertSimulatorNativeRuntime();
  const { Tensor } = await import('onnxruntime-react-native');
  return new Tensor('float32', input, [1, 48]);
}

function assertSimulatorNativeRuntime() {
  if (!hasSimulatorNativeRuntime()) {
    throw new Error(
      'ONNX Runtime native module is not installed in this app build. Rebuild the Expo dev client/native app, then reopen the simulator.',
    );
  }
}
