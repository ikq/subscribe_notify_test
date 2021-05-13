
/*
  SUBSCRIBE test
 */
let server;
let account;
let jssipUA;
let clientSubscribeDialog = null;
let serverSubscribeDialog = null;


// Run when document is ready
function main() {
    server = guiLoadServerConfig();
    account = guiLoadAccount();
    guiInit();
    guiShowPanel('main_panel');
}

function incomingSubscribe(subscribe, eventName, accepts) {
    // Check incoming SUBSCRIBE
    const ourEventName = 'test';
    const ourContentType = 'text/plain';

    // Check event type
    if (!eventName || eventName.toLowerCase() !== ourEventName) {
        console.log(typeof lcEventName, typeof ourEventName);
        guiWarning('receive SUBSCRIBE: not supported event');
        return 489; // send SIP response 489 Bad Event
    }
    // Check if accept header includes our content-type
    if (!accepts || !accepts.some(v => v.includes(ourContentType))) {
        guiWarning('receive SUBSCRIBE: accept header missed our content-type');
        return 406; // send SIP response 406 Not Acceptable.
    }
    try {
        createServerSubscribeDialog(subscribe);
        return 0; // Don't send SIP response. The created dialog send it.
    } catch (e) {
        guiWarning('Cannot create server subscribe dialog');
        console.log('Cannot create server subscribe dialog', e);
        return 400; // send SIP response 400 Bad Request.
    }
}

function guiInit() {
    document.getElementById('setting_btn').onclick = () => { guiShowPanel('setting_panel'); }
    document.getElementById('subscribe_btn').onclick = guiSubscribe;

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
        stackInit();
    }

    document.getElementById('subscribe_btn').onclick = guiSubscribe;
    document.getElementById('subscribe_return_btn').onclick = function () { guiInfo(''); guiShowPanel('dialer_panel'); }
    document.getElementById('send_init_subscribe_btn').onclick = guiSendInitSubscribe;
    document.getElementById('send_next_subscribe_btn').onclick = guiSendNextSubscribe;
    document.getElementById('send_unsubscribe_btn').onclick = guiSendUnsubscribe;
    document.getElementById('send_notify_btn').onclick = guiSendNotify;
    document.getElementById('send_terminate_notify_btn').onclick = guiSendTerminateNotify;

    if (server.domain && server.addresses && account.user && account.password) {
        stackInit();
    } else {
        guiInfo('Please fill server & account');
        guiShowPanel('setting_panel');
    }

}


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
    jssipUA.start();
}



//----------------- Local storage load/store ----------------------
function guiLoadAccount() { return storageLoadConfig('phoneAccount'); }
function guiStoreAccount(value) { storageSaveConfig('phoneAccount', value); }
function guiLoadServerConfig() { return storageLoadConfig('phoneServerConfig'); }
function guiStoreServerConfig(value) { storageSaveConfig('phoneServerConfig', value); }
function storageLoadConfig(name) {
    let str_value = localStorage.getItem(name);
    return str_value ? JSON.parse(str_value) : {}
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

//--------------- Subscribe GUI -------------------------------
function guiSubscribe() {
    guiInfo('');
    guiShowPanel('subscribe_panel');
    guiSubscribeButtons();
}

function guiSubscribeButtons() {
    document.getElementById('send_init_subscribe_btn').disabled = !!clientSubscribeDialog;
    document.getElementById('send_next_subscribe_btn').disabled = !clientSubscribeDialog;
    document.getElementById('send_unsubscribe_btn').disabled = !clientSubscribeDialog;
    document.getElementById('send_notify_btn').disabled = !serverSubscribeDialog;
    document.getElementById('send_terminate_notify_btn').disabled = !serverSubscribeDialog;
}

//------------ client SUBSCRIBE/NOTIFY dialog  ----------------------
function guiSendInitSubscribe() {
    let sendToUser = document.querySelector('#send_subscribe_form [name=user]').value.trim();
    let eventName = document.querySelector('#send_subscribe_form [name=event_name]').value.trim();
    let expires = parseInt(document.querySelector('#send_subscribe_form [name=expires]').value.trim());

    if (sendToUser === '') {
        guiWarning('Missed user name');
        return;
    }

    let domain = server.domain;
    let target =  sendToUser + '@' + domain;
    let callee = sendToUser;
    let calleeDN = null;
    let caller = account.user;
    let callerDN = null;

    // params is optional.
    // set if the user and host are different from the used in REGISTER
    let params = {
        to_uri: new JsSIP.URI('sip', callee, domain),
        to_display_name: calleeDN,
        from_uri: new JsSIP.URI('sip', caller, domain),
        from_display_name: callerDN,
    }

    /* credential is optional.
     allows use authentication different from REGISTER/INVITE
    let credential = {
        authorization_user: phone.account.authUser ? phone.account.authUser : phone.account.user,
        password: phone.account.password
    };
    */
    let credential = null;

    let listeners = {
        active: (dlg) => {
            guiInfo('client dialog: active');
            guiSubscribeButtons();
        },
        notify: (dlg, notify, body, contentType) => { // with not empty body
            console.log('receive NOTIFY', notify, body, contentType);
            guiInfo('receive NOTIFY');
        },
        terminated: (dlg, reason) => {
            guiWarning(`client dialog: terminated (${reason})`);
            clientSubscribeDialog = null;
            guiSubscribeButtons();
        }
    }

    try {
        clientSubscribeDialog = new ClientSubscribeDialog({
            jssipUA,
            target: target,
            eventName: eventName,
            accept: 'application/pidf+xml,text/json,text/plain',
            expires: expires,
            contentType: 'text/plain',
            params: params,
            listeners: listeners,
            credential: credential,
        });
    } catch (e) {
        console.log('Error: cannot create client subscribe dialog', e);
        guiError('Cannot create client dialog');
    }

    clientSubscribeDialog.subscribe();
}

function guiSendNextSubscribe() {
    if (clientSubscribeDialog === null || clientSubscribeDialog.state === 'terminated') {
        guiWarning('No client subscribe dialog');
        return;
    }
    clientSubscribeDialog.subscribe('Next subscribe');
}

function guiSendUnsubscribe() {
    if (clientSubscribeDialog === null || clientSubscribeDialog.state === 'terminated') {
        guiWarning('No client subscribe dialog');
        return;
    }
    clientSubscribeDialog.unsubscribe();
}

//------------ server SUBSCRIBE/NOTIFY dialog  ----------------------
function createServerSubscribeDialog(subscribe) {
    const ourContentType = 'text/plain';

    let listeners = {
        active: (dlg) => {
            guiInfo('server dialog: active');
            guiSubscribeButtons();
        },
        subscribe(dlg, subscribe, body, contentType) { // with not empty body
            console.log('receive SUBSCRIBE', subscribe, body, contentType);
            guiInfo('receive SUBSCRIBE');
        },
        terminated(dlg, reason) {
            guiWarning(`server dialog: terminated (${reason})`);
            serverSubscribeDialog = null;
            guiSubscribeButtons();
        }
    }
    serverSubscribeDialog = new ServerSubscribeDialog({ jssipUA, subscribe, contentType: ourContentType, listeners });
}

function guiSendNotify() {
    if (serverSubscribeDialog === null || serverSubscribeDialog.state === 'terminated') {
        guiWarning('No server subscribe dialog');
        return;
    }
    serverSubscribeDialog.sendNotify('Hi !');
}

function guiSendTerminateNotify() {
    if (serverSubscribeDialog === null || serverSubscribeDialog.state === 'terminated') {
        guiWarning('No server subscribe dialog');
        return;
    }
    serverSubscribeDialog.sendTerminateNotify();
}