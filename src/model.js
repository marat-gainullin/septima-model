import Requests from 'septima-remote/requests';

class Model {

    constructor() {
        this.changeLog = [];
    }

    dropChanges() {
        this.changeLog.splice(0, this.changeLog.length);
    }

    save(manager) {
        return Requests.requestCommit(this.changeLog, manager)
            .then(touched => {
                this.dropChanges();
                return touched;
            });
    }
}

export default Model;