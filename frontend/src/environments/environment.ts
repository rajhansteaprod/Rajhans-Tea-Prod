export const environment = {
  production: false,
  apiUrl: typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://rajhans-tea-production.up.railway.app/api/v1'
    : '/api/v1',
  firebase: {
    apiKey: 'AIzaSyCoIDaxjf0WeEf2XQJuYfl_ffArI-ZNxpE',
    authDomain: 'sarara-b9eac.firebaseapp.com',
    projectId: 'sarara-b9eac',
    storageBucket: 'sarara-b9eac.firebasestorage.app',
    messagingSenderId: '979366583863',
    appId: '1:979366583863:web:71a56efe196c2db62469b2',
  },
};
