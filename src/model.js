import Requests from 'septima-remote/requests';

class Model {

    constructor() {
        this.changeLog = [];
    }

    dropChanges() {
        this.changeLog = [];
    }

    save(manager) {
        const commitPromise = Requests.requestCommit(this.changeLog, manager);
        this.dropChanges();
        return commitPromise;
    }
}

export default Model;