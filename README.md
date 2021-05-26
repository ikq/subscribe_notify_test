# subscribe_notify_test

It's test to JsSIP extension: SUBSCRIBE/NOTIFY dialogs.
Please see: [https://github.com/versatica/JsSIP/issues/708](https://github.com/versatica/JsSIP/issues/708)

Note:
It's JsSIP subscriber/notifier API test, not presence client.
To use the code as presence client, you should modify the subscriber constructor argumentsand create SUBSCRIBE with appropriate for your server :

- event_name ( probably 'presence' ?)
- accept - list of content-type that will be used in receiving NOTIFYs. 
- content-type - content-type of your SUBSCRIBE
- set some body (if need) to subscriber.subscribe(). (in my test I send without body)

To adopt the example for your case, you should take a SIP trace for some client working with your server,
and see how to build SUBSCRIBE request.
Modify the test, and check that it generate the SUBSCRIBE as you need.
To check generated SIP SUBSCRIBE message:
please open browser dev tool (Ctrl/I) and select 'console' tab. The send/receive SIP messages will be shown in the log.

