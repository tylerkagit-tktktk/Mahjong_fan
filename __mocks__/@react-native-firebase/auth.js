let nextId = 0;
let currentUser = null;

const instance = {
  get currentUser() {
    return currentUser;
  },
  async signInAnonymously() {
    currentUser = { uid: `test_anonymous_${++nextId}` };
    return { user: currentUser };
  },
  async signOut() {
    currentUser = null;
  },
};

module.exports = () => instance;
