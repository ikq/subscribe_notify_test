
/*
  SUBSCRIBE test
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
  guiInit();
  guiShowPanel('main_panel');
}

function guiInit() {
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
    guiInfo('Please fill server & account');
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
    createNotifier(subscribe);
    return 0; // Don't send SIP response. The created dialog send it.
  } catch (e) {
    guiWarning('Cannot create server subscribe dialog');
    console.log('Cannot create server subscribe dialog', e);
    return 400; // send SIP response 400 Bad Request.
  }
}

//--------------- Subscribe GUI -------------------------------
function guiSubscribeTest() {
  guiInfo('');
  guiShowPanel('subscribe_panel');
  guiSubscribeButtons();
}

function guiSubscribeButtons() {
  document.getElementById('send_init_subscribe_btn').disabled = !!subscriber;
  document.getElementById('send_next_subscribe_btn').disabled = !subscriber;
  document.getElementById('send_unsubscribe_btn').disabled = !subscriber;
  document.getElementById('send_notify_btn').disabled = !notifier;
  document.getElementById('send_final_notify_btn').disabled = !notifier;
}

//------------ subscriber (client subscribe dialog)  ----------------------
function guiSendInitSubscribe() {
  let sendToUser = document.querySelector('#send_subscribe_form [name=user]').value.trim();
  let eventName = document.querySelector('#send_subscribe_form [name=event_name]').value.trim();
  let expires = parseInt(document.querySelector('#send_subscribe_form [name=expires]').value.trim());

  if (sendToUser === '') {
    guiWarning('Missed user name');
    return;
  }

  let target = sendToUser; 

  let params = null;
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

  let credential = null;
  /* 
   credential is optional.
   Used if authentication is different from REGISTER/INVITE
  let credential = {
      authorization_user: phone.account.authUser ? phone.account.authUser : phone.account.user,
      password: phone.account.password
  };
  */

  try {
    subscriber = jssipUA.subscriber(target, {
      event_name: eventName,
      accept: 'application/pidf+xml,text/json,text/plain',
      expires: expires,
      content_type: 'text/plain',
      params: params,
      credential: credential,
    });
  } catch (e) {
    console.log('Error: cannot create client subscribe dialog', e);
    guiError('Cannot create client dialog');
  }

  subscriber.on('active', () => {
    console.log('>> client dialog is active');
    guiInfo('client dialog: active');
  });
  subscriber.on('notify', (isTerminated, notify, body, contentType) => { // with not empty body
    console.log(`>> receive ${isTerminated ? 'terminate-' : ''}NOTIFY`, notify, body, contentType);
    guiInfo('receive NOTIFY');
  });
  subscriber.on('terminated', (reason) => {
    console.log(`>> client dialog: terminated (${reason})`);
    guiWarning(`client dialog: terminated (${reason})`);
    subscriber = null;
    guiSubscribeButtons();
  });

  subscriber.subscribe();
  guiSubscribeButtons();
}

function guiSendNextSubscribe() {
  if (subscriber === null || subscriber.state === 'terminated') {
    guiWarning('No client subscribe dialog');
    return;
  }
  subscriber.subscribe('Next subscribe');
}

function guiSendUnsubscribe() {
  if (subscriber === null || subscriber.state === 'terminated') {
    guiWarning('No client subscribe dialog');
    return;
  }
  subscriber.unsubscribe();
}

//------------ notifier (server subscribe dialog)  ----------------------
function createNotifier(subscribe) {
  const ourContentType = 'text/plain';
  let pending = true; // server dialog can be created in 'active' or 'pending' state
  notifier = jssipUA.notifier({ subscribe, content_type: ourContentType, pending });

  notifier.on('subscribe', (isUnsubscribe, subscribe, body, contentType) => {
    console.log(`server dialog>> receive ${isUnsubscribe ? 'un-' : ''}SUBSCRIBE`, subscribe, body, contentType, isUnsubscribe);
    guiInfo('receive SUBSCRIBE');
    if (!isUnsubscribe) {
      if (notifier.state === 'pending') {
        notifier.sendNotify('Dialog state is pending. Do not provide system state');
      } else {
        notifier.sendNotify('Provide current system state');
      }
    }
  });
  notifier.on('terminated', (reason) => {
    guiWarning(`server dialog>> terminated (${reason})`);
    notifier.sendFinalNotify('Final notify. Provide current system state (if was)');
    notifier = null;
    guiSubscribeButtons();
  });

  notifier.sendNotify();  // Send 1st NOTIFY immediately. Can be with or without body.
  guiSubscribeButtons();
}

function guiSendNotify() {
  if (notifier === null || notifier.state === 'terminated') {
    guiWarning('No server subscribe dialog');
    return;
  }
  // Switch state from pending to active.
  if (notifier.state === 'pending') {
    console.log('Switch state from "pending" to "active"');
    notifier.setActiveState();
  }
  notifier.sendNotify('Hi !');
}

function guiSendFinalNotify() {
  if (notifier === null || notifier.state === 'terminated') {
    guiWarning('No server subscribe dialog');
    return;
  }
  notifier.sendFinalNotify();
}