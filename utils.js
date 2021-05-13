'use strict';

/*
 * Client SUBSCRIBE dialog
 */
class ClientSubscribeDialog {
    constructor({ jssipUA, target, eventName, accept, expires, contentType, allowEvents, params, headers, listeners, credential }) {
        if( !jssipUA )
            throw 'missed reference to JsSIP instance';
        this.jssipUA = jssipUA;
        if (!target)
            throw 'missed target';
        this.target = target;
        if (!eventName)
            throw 'missed eventName';
        this.eventName = eventName;
        if (!accept)
            throw 'missed accept';
        this.accept = accept;
        if (!expires)
            expires = 900;
        this.expires = expires;
        this.allowEvents = allowEvents; // optional
        this.contentType = contentType; // optional
        if( !params)
           throw 'missed params';
        if (!params.from_uri) 
           throw 'missed params.from_uri';
        if (!params.to_uri) 
           throw 'missed params.to_uri';
        this.params = params;
        params.from_tag = JsSIP.Utils.newTag();
        params.to_tag = null;
        params.call_id = JsSIP.Utils.createRandomToken(20);
        params.cseq = Math.floor(Math.random() * 10000 + 1);
        //this.contact = '<sip:' + params.from_uri.user + '@' + JsSIP.Utils.createRandomToken(12) + '.invalid;transport=ws>';
        this.contact = '<sip:' + params.from_uri.user + '@' + params.from_uri.host + ';transport=ws>';
        if (!listeners)
            throw 'missed listeners';
        if (!listeners.active)
            throw 'missed listeners.active()';
        if (!listeners.notify)
            throw 'missed listeners.notify()';
        if (!listeners.terminated)
            throw 'missed listeners.terminated()';
        this.listeners = listeners;
        this.credential = credential; // optional
        this.state = 'init'; // init, notify_wait, pending, active, terminated
        this.id = null;      // dialog id
        this.expiresTimer = null;   // resend SUBSCRIBE before expiration
        this.expiresTS = null;      // expires timestamp.
        if (!headers)
            headers = [];
        this.headers = headers.concat([
            'Allow: SUBSCRIBE',
            'Event: ' + this.eventName,
            'Accept: ' + this.accept, // Content-type of NOTIFY body
            'Expires: ' + this.expires,
            'Contact: ' + this.contact,
        ]);
        if (this.allowEvents)
            this.headers.push('Allow-Events: ' + this.allowEvents);
        this.route_set = null;
        this.data = {};
    }

    // SUBSCRIBE callbacks
    onAuthenticated() {
        this.params.cseq++;
    }
    onRequestTimeout() {
        this._dialogTerminated('subscribe response timeout');
    }
    onTransportError() {
        this._dialogTerminated('subscribe transport error');
    }
    onReceiveResponse(response) {
        if (response.status_code >= 200 && response.status_code < 300) {
            if (this.params.to_tag === null) {
                this.params.to_tag = response.to_tag;
                this.id = this.params.call_id + this.params.from_tag + this.params.to_tag;
                console.log('CSubs: added dialog id=' + this.id);
                this.jssipUA.newDialog(this);
                this.route_set = response.getHeaders('record-route').reverse();
                if (this.route_set.length > 0)
                    this.params.route_set = this.route_set;
            }
            let expires = this._getExpires(response);
            if (expires === -1) {
                console.log('CSubs: Error: OK without Expires header');
                return;
            }
            if (expires > 0) {
                this.expiresTS = new Date().getTime() + expires * 1000;
                let timeout = this._calculateTimeoutMs(expires);
                this._scheduleSubscribe(timeout);
            }
        } else if (response.status_code >= 300) {
            this._dialogTerminated('receive subscribe non-OK response');
        }
    }
    // end of SUBSCRIBE callbacks.

    // dialog callback
    receiveRequest(request) {
        if (request.method !== 'NOTIFY') {
            reply(405); // Method Not Allowed    
            return;
        }
        request.reply(200);
        let subsState = request.parseHeader('subscription-state');
        if (!subsState) {
            console.log('CSubs: Error: NOTIFY without Subscription-State');
            return;
        }
        let newState = subsState.state.toLowerCase();
        let prevState = this.state;

        // update dialog state
        if (prevState !== 'terminated' && newState !== 'terminated') {
            this.state = newState;
            if (subsState.expires !== undefined) {
                let expires = subsState.expires;
                let notifyExpiresTS = new Date().getTime() + expires * 1000;
                const MaxTimeDeviation = 4000;
                // Shorter and the difference is too big
                if (this.expiresTS - notifyExpiresTS > MaxTimeDeviation) {
                    console.log('CSubs: update sending re-SUBSCRIBE time');
                    clearTimeout(this.expiresTimer);
                    this.expiresTS = notifyExpiresTS;
                    let timeout = this._calculateTimeoutMs(expires);
                    this._scheduleSubscribe(timeout);
                }
            }
        }
        // active callback (dialog state switched to active)
        if (prevState !== 'active' && newState === 'active') {
            console.log('CSubs>>> active: id=' + this.id);
            this.listeners.active(this);
        }

        // notify callback called only if NOTIFY has body
        let body = request.body;
        if (body) {
            let ct = request.getHeader('content-type');
            console.log('CSubs>>> notify: id=' + this.id, body, ct);
            this.listeners.notify(this, request, body, ct);
        }
        // terminated callback (dialog state switched to terminated)
        if (newState === 'terminated') {
            this._dialogTerminated('receive terminate notify');
        }
    }

    subscribe(body = null) {
        if (this.state === 'init')
            this.state = 'notify_wait';
        let headers = this.headers.slice();
        if (body) {
            if (!this.contentType) {
                console.log('CSubs: subscribe(): Error - contentType is not defined');
                throw 'CSubs.subscribe(): Missed contentType';
            }
            headers.push('Content-Type: ' + this.contentType);
        }
        this._send(body, headers);
    }

    unsubscribe() {
        this._dialogTerminated('send un-subscribe');
        let headers = [
            'Event: ' + this.eventName,
            'Expires: 0'
        ];
        this._send(null, headers);
    }

    _dialogTerminated(reason) {
        if (this.state === 'terminated')
            return;
        clearTimeout(this.expiresTimer);
        this.state = 'terminated';
        // remove dialog from dialogs table with some delay, to allow receive end NOTIFY
        setTimeout(() => {
            console.log('CSubs: removed dialog id=' + this.id);
            this.jssipUA.destroyDialog(this);
        }, 32000);
        console.log(`CSubs>>> terminated: "${reason}" id=${this.id}`);
        this.listeners.terminated(this, reason);
    }
    _send(body, headers) {
        this.params.cseq++;
        this.jssipUA.sendRequest('SUBSCRIBE', this.target, this.params, headers, body, this, this.credential);
    }
    _getExpires(r) {
        let e = r.getHeader('expires');
        return e ? parseInt(e) : -1;
    }
    _calculateTimeoutMs(expires) {
        return expires >= 140 ? (expires * 1000 / 2) + Math.floor(((expires / 2) - 70) * 1000 * Math.random()) : (expires * 1000) - 5000;
    }
    _scheduleSubscribe(timeout) {
        console.log('CSubs: next SUBSCRIBE will be sent in ' + Math.floor(timeout / 1000) + ' sec');
        this.expiresTimer = setTimeout(() => {
            this.expiresTimer = undefined;
            this._send(null, this.headers);
        }, timeout);
    }
}


/*
 * Server SUBSCRIBE dialog
 */
class ServerSubscribeDialog {
    constructor({ jssipUA, subscribe, contentType, headers, listeners, credential }) {
        if( !jssipUA )
          throw 'missed jssipUA';
        this.jssipUA = jssipUA;
        this.expiresTS = null;
        this.expiresTimer = null;
        this.state = 'active';
        this.receivedFirstNotifyResponse = false;
        this.id = null;
        this.eventName = subscribe.getHeader('event');
        this.contentType = contentType;
        if (!contentType)
            throw 'missed contentType for NOTIFY'
        this.expires = parseInt(subscribe.getHeader('expires'));
        if (!listeners)
            throw 'missed listeners';
        if (!listeners.active)
            throw 'missed listeners.active()';
        if (!listeners.subscribe)
            throw 'missed listeners.subscribe()';
        if (!listeners.terminated)
            throw 'missed listeners.terminated()';
        this.listeners = listeners;
        this.credential = credential;
        let user = subscribe.to.uri.user;
        let domain = subscribe.to.uri.host;
        this.contact = '<sip:' + user + '@' + domain + ';transport=ws>';
        this.rcseq = subscribe.cseq;
        this.data = {};
        this.headers = headers ? headers : [];
        this.target = subscribe.from.uri.user;
        subscribe.to_tag = JsSIP.Utils.newTag();
        this.params = {
            from: subscribe.to,
            from_tag: subscribe.to_tag,
            to: subscribe.from,
            to_tag: subscribe.from_tag,
            call_id: subscribe.call_id,
            cseq: Math.floor(Math.random() * 10000 + 1),
        };
        this.id = this.params.call_id + this.params.from_tag + this.params.to_tag;
        console.log('SSubs: add dialog id=' + this.id);
        this.jssipUA.newDialog(this);
        this._setExpiresTS();
        this._setExpiresTimer();
        subscribe.reply(200, null, ['Expires: ' + this.expires, 'Contact: ' + this.contact]);
        this.sendNotify(); // the first NOTIFY send automatically.
    }

    sendNotify(body = null) {
        let subsState = this.state;
        if (this.state !== 'terminated') {
            subsState += ';expires=' + this._getExpiresTS();
        }
        let headers = this.headers.slice();
        headers.push('Subscription-State: ' + subsState);
        headers.push('Event: ' + this.eventName);
        if (body) {
            headers.push('Content-Type: ' + this.contentType);
        }
        this.params.cseq++;
        this.jssipUA.sendRequest('NOTIFY', this.target, this.params, headers, body, this, this.credential);
    }

    sendTerminateNotify() {
        this._dialogTerminated('send terminate notify');
        this.sendNotify();
    }
    // NOTIFY callbacks
    onAuthenticated() {
        this.params.cseq++;
    }
    onRequestTimeout() {
        this._dialogTerminated('notify response timeout');
    }
    onTransportError() {
        this._dialogTerminated('notify transport error');
    }
    onReceiveResponse(response) {
        if (response.status_code >= 200 && response.status_code < 300) {
            if (!this.receivedFirstNotifyResponse) {
                this.receivedFirstNotifyResponse = true;
                this.route_set = response.getHeaders('record-route').reverse();
                if (this.route_set.length > 0)
                    this.params.route_set = this.route_set;
                console.log('SSubs>>> active: id=' + this.id);
                this.listeners.active(this);
            }
        } else if (response.status_code >= 300) {
            this._dialogTerminated('receive notify non-OK response');
        }
    }
    // NOTIFY callbacks

    receiveRequest(request) {
        if (request.method !== 'SUBSCRIBE') {
            reply(405); // Method Not Allowed    
            return;
        }
        this.expires = parseInt(request.getHeader('expires'));
        request.reply(200, null, ['Expires: ' + this.expires, 'Contact: ' + this.contact]);

        let body = request.body;
        if (body) {
            let ct = request.getHeader('content-type');
            console.log('SSubs>>> subscribe: id=' + this.id, body, ct);
            this.listeners.subscribe(this, request, body, ct);
        }

        if (this.expires === 0) {
            this._dialogTerminated('receive un-subscribe');
        } else {
            this._setExpiresTS();
            this._setExpiresTimer();
        }
    }

    _dialogTerminated(reason) {
        if (this.state === 'terminated')
            return;
        this.state = 'terminated';
        clearTimeout(this.expiresTimer);
        // if delay needed ?
        setTimeout(() => {
            console.log('SSubs: remove dialog id=' + this.id);
            this.jssipUA.destroyDialog(this);
        }, 32000);
        console.log(`SSubs>>> terminated: "${reason}" id=${this.id}`);
        this.listeners.terminated(this, reason);
    }
    _setExpiresTS() {
        this.expiresTS = new Date().getTime() + this.expires * 1000;
    }
    _getExpiresTS() {
        let current = new Date().getTime();
        let delta = Math.floor((this.expiresTS - current) / 1000);
        return delta >= 0 ? delta : 0;
    }
    _setExpiresTimer() {
        clearTimeout(this.expiresTimer);
        setTimeout(() => {
            this._dialogTerminated('subscription expired');
            this.sendNotify();
        }, this.expires * 1000);
    }
}