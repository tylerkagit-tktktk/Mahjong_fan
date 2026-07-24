module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@react-native-firebase/app$': '<rootDir>/__mocks__/@react-native-firebase/app.js',
    '^@react-native-firebase/auth$': '<rootDir>/__mocks__/@react-native-firebase/auth.js',
    '^@react-native-firebase/firestore$': '<rootDir>/__mocks__/@react-native-firebase/firestore.js',
  },
};
