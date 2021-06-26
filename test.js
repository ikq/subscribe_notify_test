
/*
  SUBSCRIBE/NOTIFY JsSIP test
 */
let server;
let account;
let jssipUA;
let subscriber = null;
let notifier = null;

// Run when document is ready
function main() {
    server = guiLoadServerConfig({ domain: '', addresses: '' });
    account = guiLoadAccount({ user: '', password: '', displayName: '', authUser: '' });
    init();
    guiShowPanel('main_panel');
}

function init() {
    document.getElementById('setting_btn').onclick = () => { guiShowPanel('setting_panel'); }
    document.getElementById('subscribe_test_btn').onclick = guiSubscribeTest;

    //----------- set server and account fields in HTML ------------
    document.querySelector('#setting [name=sip_domain]').value = server.domain;
    document.querySelector('#setting [name=sip_addresses]').value = JSON.stringify(server.addresses);
    document.querySelector('#setting [name=user]').value = account.user;
    document.querySelector('#setting [name=password]').value = account.password;
    document.querySelector('#setting [name=display_name]').value = account.displayName;
    document.querySelector('#setting [name=auth_user]').value = account.authUser;

    document.getElementById('login_btn').onclick = function () {
        let user = document.querySelector('#setting [name=user]').value || '';
        let authUser = document.querySelector('#setting [name=auth_user]').value || '';
        let password = document.querySelector('#setting [name=password]').value || '';
        let displayName = document.querySelector('#setting [name=display_name]').value || '';

        // trim spaces
        user = user.trim();
        authUser = authUser.trim();
        password = password.trim();
        displayName = displayName.trim();

        let account = {
            user: user,
            authUser: authUser,
            password: password,
            displayName: displayName
        };
        guiStoreAccount(account);

        let domain = document.querySelector('#setting [name=sip_domain]').value;
        let addresses = document.querySelector('#setting [name=sip_addresses]').value;

        // trim spaces
        domain = domain.trim();
        addresses = addresses.trim();

        let conf = {
            domain: domain,
            addresses: JSON.parse(addresses),
        };
        guiStoreServerConfig(conf);
        location.reload();
    }

    document.getElementById('subscribe_test_btn').onclick = guiSubscribeTest;
    document.getElementById('subscribe_return_btn').onclick = function () { guiInfo(''); guiShowPanel('main_panel'); }
    document.getElementById('send_init_subscribe_btn').onclick = guiSendInitSubscribe;
    document.getElementById('send_next_subscribe_btn').onclick = guiSendNextSubscribe;
    document.getElementById('send_unsubscribe_btn').onclick = guiSendUnsubscribe;
    document.getElementById('send_notify_btn').onclick = guiSendNotify;
    document.getElementById('send_final_notify_btn').onclick = guiSendFinalNotify;

    if (server.domain && server.addresses && account.user && account.password) {
        try {
            stackInit();
        } catch (e) {
            guiError(e);
            guiShowPanel('setting_panel');
            return;
        }
    } else {
        guiError('Please fill server & account');
        guiShowPanel('setting_panel');
    }
}

//----------------- Local storage load/store ----------------------
function guiLoadAccount(def) { return storageLoadConfig('testAccount', def); }
function guiStoreAccount(value) { storageSaveConfig('testAccount', value); }
function guiLoadServerConfig(def) { return storageLoadConfig('testServerConfig', def); }
function guiStoreServerConfig(value) { storageSaveConfig('testServerConfig', value); }
function storageLoadConfig(name, def = {}) {
    let str_value = localStorage.getItem(name);
    return str_value ? JSON.parse(str_value) : def;
}
function storageSaveConfig(name, value) {
    localStorage.setItem(name, JSON.stringify(value));
}

//------------- Set status line --------------------
function guiError(text) { guiStatus(text, 'Pink'); }
function guiWarning(text) { guiStatus(text, 'Gold'); }
function guiInfo(text) { guiStatus(text, 'Aquamarine'); }
function guiStatus(text, color) {
    let line = document.getElementById('status_line');
    line.setAttribute('style', `background-color: ${color}`);
    line.innerHTML = text;
}

//--------------- Show or hide element -------
function guiShow(id) {
    document.getElementById(id).style.display = 'block';
}
function guiHide(id) {
    document.getElementById(id).style.display = 'none';
}

//--------------- Show active panel and hide others  ----------------
function guiShowPanel(activePanel) {
    const panels = ['main_panel', 'setting_panel', 'subscribe_panel'
    ];
    for (let panel of panels) {
        if (panel === activePanel) {
            guiShow(panel);
        } else {
            guiHide(panel);
        }
    }
}

//----------------- JsSIP init ------------------------
function stackInit() {
    let sockets = [];
    for (let address of server.addresses) {
        if (address instanceof Array) { // 'address' or ['address', weight]
            sockets.push({ socket: new JsSIP.WebSocketInterface(address[0]), weight: address[1] });
        } else {
            sockets.push(new JsSIP.WebSocketInterface(address));
        }
    }

    let config = {
        sockets: sockets,
        uri: 'sip:' + account.user + '@' + server.domain,
        contact_uri: 'sip:' + account.user + '@' + JsSIP.Utils.createRandomToken(12) + '.invalid;transport=ws',
        authorization_user: account.authUser ? account.authUser : account.user,
        password: account.password,
        register: true,
        register_expires: 3600,
    };

    if (account.displayName && account.displayName.length > 0) {
        config.display_name = account.displayName;
    }

    jssipUA = new JsSIP.UA(config);
    jssipUA.on('connected', (e) => {
        guiInfo('connected');
    });

    jssipUA.on('disconnected', () => {
        guiInfo('disconnected');
        guiShowPanel('main_panel');
    });

    jssipUA.on('registered', (e) => {
        guiInfo('registered');
    });

    jssipUA.on('unregistered', (e) => {
        guiInfo('unregistered');
    });

    jssipUA.on('registrationFailed', (e) => {
        guiError('regisration failed');
    });

    jssipUA.on('newSubscribe', (e) => {
        let subs = e.request;
        let ev = subs.parseHeader('event');
        let accepts = subs.getHeaders('accept');
        console.log('incomingSubscribe', subs, ev.event, accepts);
        let code = incomingSubscribe(subs, ev.event, accepts);
        if (code > 0)
            subs.reply(code);
    });

    JsSIP.debug.enable('JsSIP:*');
    jssipUA.start();
}

//--------- incoming SUBSCRIBE. Accept or reject ?  ----------
function incomingSubscribe(subscribe, eventName, accepts) {
    // Check incoming SUBSCRIBE
    const ourEventName = 'test';
    const ourContentType = 'text/plain';

    // Check event type
    if (eventName !== ourEventName) {
        guiWarning('receive SUBSCRIBE: not supported our event');
        return 489; // send SIP response 489 Bad Event
    }
    // Check if accept header includes our content-type
    if (!accepts || !accepts.some(v => v.includes(ourContentType))) {
        guiWarning('receive SUBSCRIBE: accept header missed our content-type');
        return 406; // send SIP response 406 Not Acceptable.
    }
    try {
        createNotifier(subscribe);
        return 0; // Don't send SIP response. The created dialog send it.
    } catch (e) {
        guiWarning('Cannot notifier');
        console.log('Cannot notifier', e);
        return 400; // send SIP response 400 Bad Request.
    }
}

//--------------- Subscribe test panel -------------------------------
function guiSubscribeTest() {
    guiInfo('');
    guiShowPanel('subscribe_panel');
    guiShowButtons();
}

function guiShowButtons() {
    document.getElementById('send_init_subscribe_btn').disabled = !!subscriber;
    document.getElementById('send_next_subscribe_btn').disabled = !subscriber;
    document.getElementById('send_unsubscribe_btn').disabled = !subscriber;
    document.getElementById('send_notify_btn').disabled = !notifier;
    document.getElementById('send_final_notify_btn').disabled = !notifier;
}

//-------------------------------------------------------------------------
//--------------- subscriber (client subscribe dialog)  -------------------
//-------------------------------------------------------------------------
function guiSendInitSubscribe() {
    let sendToUser = document.querySelector('#send_subscribe_form [name=user]').value.trim();
    let eventName = document.querySelector('#send_subscribe_form [name=event_name]').value.trim();
    let expires = parseInt(document.querySelector('#send_subscribe_form [name=expires]').value.trim());

    if (sendToUser === '') {
        guiWarning('Missed user name');
        return;
    }

    let target = sendToUser;

    //let params = null;
    let params = {
        cseq: 10
    };
    /*
      params is optional.
      Used if domain or from-user is different from used in REGISTER/INVITE
  
      let params = {
          to_uri: new JsSIP.URI('sip', target, server.domain),
          to_display_name: null,
          from_uri: new JsSIP.URI('sip', account.user, server.domain),
          from_display_name: null,
      }
    */

    try {
        subscriber = jssipUA.subscribe(
            target,
            eventName,              // event name with optional ;id=xxx
            'text/json,text/plain', // We understand NOTIFY with the Content-Type
            {
                expires: expires,               // Subscription expires. E.g. 3600
                contentType: 'text/plain',      // Content-Type of SUBSCRIBE requests.
                params: params,
            });
    } catch (e) {
        console.log('Error: cannot create subscriber', e);
        guiError('Cannot create subscriber');
    }

    /** 
     * 1st NOTIFY with Subscription-State: active
     */
    subscriber.on('active', () => {
        console.log('>> subscriber is active');
        guiInfo('subscriber: active');
    });

    /** 
        Incoming NOTIFY with body 
        If NOTIFY Subscription-State: terminated - the argument isTerminated = true 
    */
    subscriber.on('notify', (isFinal, notify, body, contentType) => { // with not empty body
        console.log(`>> receive ${isFinal ? 'final ' : ''}NOTIFY`, notify, body, contentType);
        guiInfo(`receive ${isFinal ? 'final ' : ''}notify`);
    });

    /**
     * subscriber dialog terminated. 
     * 
     * termination code converted to English text.
     * 
     * For terminationCode==RECEIVE_FINAL_NOTIFY 
     * can be set optional SubscriptionState header parameters:
     *  reason  (undefined or string)
     *  retryAfter (undefined or number)
     */
    subscriber.on('terminated', (terminationCode, reason, retryAfter) => {
        let terminationText = subscriberTerminationText(subscriber, terminationCode);
        console.log(`subscriber>>: terminated (${terminationText})${reason ? (' reason="' + reason + '"') : ''}${retryAfter !== undefined ? (' retry-after=' + retryAfter) : ''}`);
        guiWarning(`subscriber: terminated (${terminationText})${reason ? (' reason="' + reason + '"') : ''}`);
        subscriber = null;
        if (retryAfter !== undefined) {
            console.log(`You asked repeat subscription after ${retryAfter} seconds`);
        }
        guiShowButtons();
    });

    subscriber.on('dialogCreated', () => {
        console.log('subscriber>>: dialogCreated');
    });

    if (expires > 0) {
        // normal subscribe
        subscriber.subscribe();
    } else {
        // fetch SUBSCRIBE (with expires: 0), see RFC 6665 4.4.3
        subscriber.terminate();
    }
    guiShowButtons();
}

// Convert termination code to English message.
function subscriberTerminationText(subscriber, terminationCode) {
    switch (terminationCode) {
        case subscriber.C.SUBSCRIBE_RESPONSE_TIMEOUT: return 'subscribe response timeout';
        case subscriber.C.SUBSCRIBE_TRANSPORT_ERROR: return 'subscribe transport error';
        case subscriber.C.SUBSCRIBE_NON_OK_RESPONSE: return 'subscribe non-OK response';
        case subscriber.C.SUBSCRIBE_BAD_OK_RESPONSE: return 'subscribe bad-OK response';
        case subscriber.C.SUBSCRIBE_FAILED_AUTHENTICATION: return 'subscribe failed authentication';
        case subscriber.C.UNSUBSCRIBE_TIMEOUT: return 'un-unsubscribe timeout';
        case subscriber.C.RECEIVE_FINAL_NOTIFY: return 'receive final notify';
        case subscriber.C.RECEIVE_BAD_NOTIFY: return 'receive bad notify';
        default: return 'unknown termination code: ' + terminationCode;
    }
}

// Send next SUBSCRIBE (after initial)
function guiSendNextSubscribe() {
    if (subscriber === null || subscriber.state === subscriber.C.STATE_TERMINATED) {
        guiWarning('No subscriber');
        return;
    }
    subscriber.subscribe('Next subscribe');
}

// Send unSubscribe (SUBSCRIBE with expires: 0)
function guiSendUnsubscribe() {
    if (subscriber === null || subscriber.state === subscriber.C.STATE_TERMINATED) {
        guiWarning('No subscriber');
        return;
    }
    subscriber.terminate();
}

//-----------------------------------------------------------------------
//------------ notifier (server subscribe dialog)  ----------------------
//-----------------------------------------------------------------------
// In clients, it is used less often than subscriber
// In this test, it is used to debug the subscriber

function createNotifier(subscribe) {
    const ourContentType = 'text/plain';
    let pending = true; // notifier can be created in 'active' or 'pending' state

    // to test fetch 
    const isFetchSubscribe = subscribe.getHeader('expires') === '0';

    notifier = jssipUA.notify(subscribe, ourContentType, { pending });

    // The event called for intitial and next subscribes.
    notifier.on('subscribe', (isUnsubscribe, subscribe, body, contentType) => {
        console.log(`notifier>> receive ${isUnsubscribe ? 'un-' : ''}SUBSCRIBE`, subscribe, body, contentType, isUnsubscribe);
        guiInfo('receive subscribe');
        if (isUnsubscribe) {
            notifier.terminate(`Provide current system state (final notify)${isFetchSubscribe ? ' (fetch subscribe)' : ''}`);
        } else {
            if (notifier.state === notifier.C.STATE_PENDING) {
                notifier.notify('State is pending. Do not provide system state');
            } else {
                notifier.notify('Provide current system state');
            }
        }
    });

    notifier.on('terminated', (terminationCode, finalNotify) => {
        let terminationText = notifierTerminationText(notifier, terminationCode);
        guiWarning(`notifier>> terminated (${terminationText})`);
        // finalNotify=true for subscription timeout case
        // You have to send final NOTIFY in the case (with or without body)
        if (finalNotify) {
            notifier.terminate('Final notify. Provide current system state (if was)');
        }
        notifier = null;
        guiShowButtons();
    });

    notifier.start();
    guiShowButtons();
}

function notifierTerminationText(notifier, terminationCode) {
    switch (terminationCode) {
        case notifier.C.NOTIFY_RESPONSE_TIMEOUT: return 'notify response timeout';
        case notifier.C.NOTIFY_TRANSPORT_ERROR: return 'notify transport error';
        case notifier.C.NOTIFY_NON_OK_RESPONSE: return 'notify non-OK response';
        case notifier.C.NOTIFY_FAILED_AUTHENTICATION: return 'notify failed authentication';
        case notifier.C.SEND_FINAL_NOTIFY: return 'send final notify';
        case notifier.C.RECEIVE_UNSUBSCRIBE: return 'receive un-subscribe';
        case notifier.C.SUBSCRIPTION_EXPIRED: return 'subscription expired';
        default: return 'unknown termination code: ' + terminationCode;
    }
}

function guiSendNotify() {
    if (notifier === null || notifier.state === notifier.C.STATE_TERMINATED) {
        guiWarning('No notifier');
        return;
    }
    // Switch state from pending to active.
    if (notifier.state === notifier.C.STATE_PENDING) {
        console.log('Switch state from "pending" to "active"');
        notifier.setActiveState();
    }
    notifier.notify('Hi !');
}

function guiSendFinalNotify() {
    if (notifier === null || notifier.state === notifier.C.STATE_TERMINATED) {
        guiWarning('No notifier');
        return;
    }
    // final notify
    // notifier.terminate('final state');

    // final notify with reason and retry-after
    notifier.terminate('final state', 'probation', 20);
}