import { getApp } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export function getFirebaseApp() {
  return getApp();
}

export function getFirestore() {
  return firestore(getFirebaseApp());
}

export function getFirebaseAuth() {
  return auth(getFirebaseApp());
}
