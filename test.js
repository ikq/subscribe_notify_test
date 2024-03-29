
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
    document.getElementById('subscribe_test_btn').onclick = guiSubscribePanel;

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

    document.getElementById('subscribe_test_btn').onclick = guiSubscribePanel;
    document.getElementById('subscribe_return_btn').onclick = function () { guiInfo(''); guiShowPanel('dialer_panel'); }
    document.getElementById('send_init_subscribe_btn').onclick = guiSendInitSubscribe;
    document.getElementById('send_next_subscribe_btn').onclick = guiSendNextSubscribe;
    document.getElementById('send_unsubscribe_btn').onclick = guiSendUnsubscribe;
    document.getElementById('send_notify_btn').onclick = guiSendNotify;
    document.getElementById('send_final_notify_btn').onclick = guiSendFinalNotify;
    document.getElementById('send_initial_and_next_subscribe_btn').onclick = guiSendInitAndNextSubscribe;

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


function incomingSubscribe(subscribe, eventName, accepts) {
    // Check incoming SUBSCRIBE
    let ourEventName = document.querySelector('#subscribe_test_setting_form [name=event_name]').value.trim();
    let ourContentType = document.querySelector('#subscribe_test_setting_form [name=content_type]').value.trim();

    // Check event type
    if (!eventName || eventName !== ourEventName) {
        guiWarning(`receive SUBSCRIBE: Event: ${eventName} We support Event: ${ourEventName}`);
        return 489; // send SIP response 489 "Bad Event"
    }
    // Check if accept header includes our content-type
    if (!accepts || !accepts.some(v => v.includes(ourContentType))) {
        guiWarning(`receive SUBSCRIBE: Accept: ${accepts} We support Content-Type: ${ourContentType}`);
        return 406; // send SIP response 406 "Not Acceptable"
    }
    try {
        createNotifier(subscribe);
    } catch (e) {
        guiWarning('Cannot create server subscribe dialog');
        console.log('Cannot create server subscribe dialog', e);
        return 400; // send SIP response 400 "Bad Request"
    }
    return 0; // Don't send SIP response, created dialog will send it.
}

//--------------- Subscribe test panel -------------------------------
function guiSubscribePanel() {
    guiInfo('');
    guiShowPanel('subscribe_panel');
    guiSubscribeButtons();
}

function guiSubscribeButtons() {
    document.getElementById('send_init_subscribe_btn').disabled = !!subscriber;
    document.getElementById('send_initial_and_next_subscribe_btn').disabled = !!subscriber;
    document.getElementById('send_next_subscribe_btn').disabled = !subscriber;
    document.getElementById('send_unsubscribe_btn').disabled = !subscriber;
    document.getElementById('send_notify_btn').disabled = !notifier;
    document.getElementById('send_final_notify_btn').disabled = !notifier;
}


//-------------------------------------------------------------------------
//--------------- subscriber (client subscribe dialog)  -------------------
//-------------------------------------------------------------------------
function guiSendInitSubscribe() {
    let user = document.querySelector('#subscribe_test_setting_form [name=user]').value.trim();
    let eventName = document.querySelector('#subscribe_test_setting_form [name=event_name]').value.trim();
    let accept = document.querySelector('#subscribe_test_setting_form [name=accept]').value.trim();
    let contentType = document.querySelector('#subscribe_test_setting_form [name=content_type]').value.trim();
    let expires = parseInt(document.querySelector('#subscribe_test_setting_form [name=expires]').value.trim());
    if (user === '') {
        guiWarning('Missed user name');
        return;
    }

    let target = user; // + '@' + serverConfig.domain;
    let params = null;

    /* 
       params is optional.
       Used if domain or from-user is different from used in REGISTER/INVITE

       let params = {
        to_uri: new JsSIP.URI('sip', user, serverConfig.domain),
        to_display_name: null,
        from_uri: new JsSIP.URI('sip', userAccount.user, serverConfig.domain),
        from_display_name: null,
    }
    */
    try {
        subscriber = jssipUA.subscribe(
            target,
            eventName,
            accept, {
            expires,
            contentType,
            params
        });
    } catch (e) {
        console.log('Error: cannot create subscriber', e);
        guiError('Cannot create subscriber');
    }

    /**
     * Active event
     * Received the first NOTIFY with Subscription-State: active
     */
    subscriber.on('active', () => {
        console.log('subscriber>> active')
        guiInfo('subscriber: active');
    });

    /** 
     * Incoming NOTIFY with body event
     * If NOTIFY Subscription-State: terminated - the argument isFinal = true 
     */
    subscriber.on('notify', (isFinal, notify, body, contentType) => { // with not empty body
        console.log(`subscriber>> receive ${isFinal ? 'final ' : ''}NOTIFY`, notify, body, contentType);
        guiInfo(`receive ${isFinal ? 'final ' : ''}notify`);
    });

    /**
     * Subscription terminated. 
     * 
     * Termination code converted to English text.
     * 
     * For terminationCode==RECEIVE_FINAL_NOTIFY may be set 
     * SubscriptionState header parameters:
     *   reason  (undefined or string)
     *   retryAfter (undefined or number)
     */
    subscriber.on('terminated', (terminationCode, reason, retryAfter) => {
        let terminationText = subscriberTerminationText(subscriber, terminationCode);
        console.log(`subscriber>>: terminated (${terminationText})${reason ? (' reason="' + reason + '"') : ''}${retryAfter !== undefined ? (' retry-after=' + retryAfter) : ''}`);
        guiWarning(`subscriber: terminated (${terminationText})${reason ? (' reason="' + reason + '"') : ''}`);
        subscriber = null;
        if (retryAfter !== undefined) {
            console.log(`You asked repeat subscription after ${retryAfter} seconds`);
        }
        guiSubscribeButtons();
    });

    /**
     * Subscribe dialog accepted (subscribe OK received)
     * Next after initial subscribe can be send only after the event
     * 
     * If you send sequence: initial subscribe and immediately next subscribe,
     * next subscribe should be enqueued and send after the event.
     * (See subscribe enqueue example in ACD phone prototype broadsoft_acd.js)
     */
    subscriber.on('accepted', () => {
        console.log('subscriber>>: accepted');
    });

    if (expires > 0) {
        // normal subscribe
        subscriber.subscribe();
    } else {
        // fetch SUBSCRIBE (with expires: 0), see RFC 6665 4.4.3
        subscriber.terminate();
    }
    guiSubscribeButtons();
}


// Send next SUBSCRIBE (after initial)
function guiSendNextSubscribe() {
    if (subscriber === null || subscriber.state === subscriber.C.STATE_TERMINATED) {
        guiWarning('No subscriber');
        return;
    }
    let body = JSON.stringify({ text: "Next subscribe body" });
    subscriber.subscribe(body);
}

// After initial immediately send next subscribe.
// Next subscribe cannot be send before response to initial subscribe,
// so will be used enqueue & dequeue.
function guiSendInitAndNextSubscribe() {
    guiSendInitSubscribe();
    if (subscriber) {
        guiSendNextSubscribe();
        //guiSendUnsubscribe();
    }
}

// Send unSubscribe (SUBSCRIBE with expires: 0)
function guiSendUnsubscribe() {
    if (subscriber === null || subscriber.state === subscriber.C.STATE_TERMINATED) {
        guiWarning('No subscriber');
        return;
    }
    subscriber.terminate();
}

function subscriberTerminationText(subscriber, terminationCode) {
    if (!subscriber)
        return `subscriber terminated with code ${terminationCode}`;
    switch (terminationCode) {
        case subscriber.C.SUBSCRIBE_RESPONSE_TIMEOUT: return 'subscribe response timeout';
        case subscriber.C.SUBSCRIBE_TRANSPORT_ERROR: return 'subscribe transport error';
        case subscriber.C.SUBSCRIBE_NON_OK_RESPONSE: return 'subscribe non-OK response';
        case subscriber.C.SUBSCRIBE_BAD_OK_RESPONSE: return 'subscribe bad OK response (missed Contact)';
        case subscriber.C.SUBSCRIBE_FAILED_AUTHENTICATION: return 'subscribe failed authentication';
        case subscriber.C.UNSUBSCRIBE_TIMEOUT: return 'un-subscribe timeout';
        case subscriber.C.RECEIVE_FINAL_NOTIFY: return 'receive final notify';
        case subscriber.C.RECEIVE_BAD_NOTIFY: return 'receive bad notify';
        default: return 'unknown termination code: ' + terminationCode;
    }
}

//------------ notifier (server subscribe dialog)  ----------------------
//
// In clients, it is used less often than subscriber
// In this test, it is used to debug the subscriber
function createNotifier(subscribe) {
    guiSubscribeButtons();
    let contentType = document.querySelector('#subscribe_test_setting_form [name=content_type]').value.trim();
    let pending = true; // notifier can be created in 'active' or 'pending' state
    notifier = jssipUA.notify(subscribe, contentType, { pending });
    let isFetchSubscribe = subscribe.getHeader('expires') === '0';

    // The event called for intitial and next subscribes.
    notifier.on('subscribe', (isUnsubscribe, subscribe, body, contentType) => {
        console.log(`notifier>> receive ${isUnsubscribe ? 'un-' : ''}SUBSCRIBE`, subscribe, body, contentType, isUnsubscribe);
        guiInfo('receive subscribe');

        if (isUnsubscribe) {
            notifier.terminate(`Provide current system state (final notify)${isFetchSubscribe ? ' (fetch subscribe)' : ''}`);
        } else {
            if (notifier.state === notifier.C.STATE_PENDING) {
                notifier.notify(JSON.stringify({ text: 'Dialog state is pending. Do not provide system state' }));
            } else {
                notifier.notify(JSON.stringify({ text: 'Provide current system state' }));
            }
        }
    });

    /**
     * Notification terminated
     */
    notifier.on('terminated', (terminationCode, sendFinalNotify) => {
        let terminationText = notifierTerminationText(notifier, terminationCode);
        guiWarning(`notifier: terminated (${terminationText})`);

        // sendFinalNotify=true will be set for subscription timeout.
        // You have to send final NOTIFY in the case 
        // - final notify can be with or without body.
        // - reason must be "timeout".
        if (sendFinalNotify) {
            const body = JSON.stringify({ text: 'Terminated state. Current data' });
            notifier.terminate(body, "timeout");
        }
        notifier = null;
        guiSubscribeButtons();
    });

    notifier.start();
    guiSubscribeButtons();
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

    // send NOTIFY with body
    let body = JSON.stringify({ text: 'current system state' });
    notifier.notify(body);
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

function notifierTerminationText(notifier, terminationCode) {
    if (!notifier)
        return `notifier terminated with code ${terminationCode}`;
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
//---------------- end of SUBSCRIBE/NOTIFY examples ------------------