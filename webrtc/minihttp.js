import path from 'path';import fs from 'fs';import{spawn}from'child_process';import{pushLogs,getJsonFile,COLOR_CODES,BASH_COLORS_HELPER,CONST_STRINGS}from'./utils.js';function after_http_listen(server,cfg){if(!server||!cfg){console.error('Error: httpServer or config is missing.');return}try{const addr=server.address();const host=addr.address==='0.0.0.0'?'localhost':addr.address;const protocol=cfg.isUseHTTPs?'https':'http';const domainURL=`${protocol}://${host}:${addr.port}/`;const{getGreenFG,getYellowFG,getRedBG}=BASH_COLORS_HELPER;const green=getGreenFG();const yellow=getYellowFG();const redBG=getRedBG();console.log('\n');console.log(green,'Socket.io is listening at:');console.log(green,`\t${domainURL}`);if(!cfg.isUseHTTPs){console.log('You can use --ssl to enable HTTPs:');console.log(yellow,'\tnode server --ssl')}console.log('Your web-browser (HTML file) MUST set this line:');console.log(green,`\tconnection.socketURL = "${domainURL}";`);if(host!=='localhost'&&!cfg.isUseHTTPs){console.log(redBG,'Warning:');console.log(redBG,'Please run on HTTPs to make sure audio, video, and screen demos can work on Google Chrome as well.')}if(cfg.enableAdmin===true){console.log(`Admin page is enabled and running on: ${domainURL}admin/`);console.log(`\tAdmin page username: ${cfg.adminUserName}`);console.log(`\tAdmin page password: ${cfg.adminPassword}`)}console.log('For more help: ',yellow,'node server.js --help');console.log('\n')}catch(error){pushLogs(cfg,'after_http_listen',error)}}function cmdExec(cmd,args,onData,onEnd){const child=spawn(cmd,args);let stdout='';child.stdout.on('data',(data)=>{try{stdout+=data.toString();if(onData)onData(stdout)}catch(error){pushLogs(config,'cmdExec.data',error)}});child.stdout.on('end',()=>{try{if(onEnd)onEnd(stdout)}catch(error){pushLogs(config,'cmdExec.end',error)}});return{stdout}}function logConsole(stdout){try{console.log(stdout);const pidToBeKilled=stdout.split('\nnode    ')[1]?.split(' ')[0];if(!pidToBeKilled){console.log('No process found using the port.');return}console.log('------------------------------');console.log('Please execute the following command:');console.log(BASH_COLORS_HELPER.getRedFG(),`kill ${pidToBeKilled}`);console.log('Then try to run "server.js" again.');console.log('------------------------------')}catch(error){pushLogs(config,'logConsole',error)}}function before_http_listen(server,cfg){server.on('error',(error)=>{pushLogs(cfg,'app.onerror',error);if(error.code!=='EADDRINUSE')return;safeExecute(cfg,'before_http_listen.error',()=>{const address=error.address==='0.0.0.0'?'localhost':error.address;const socketURL=`${cfg.isUseHTTPs?'https':'http'}://${address}:${error.port}/`;console.log('------------------------------');console.log(BASH_COLORS_HELPER.getRedFG(),`Unable to listen on port: ${error.port}`);console.log(BASH_COLORS_HELPER.getRedFG(),`${socketURL} is already in use. Please kill the processes below using "kill PID".`);console.log('------------------------------');cmdExec(cfg,'lsof',['-n','-i4TCP:'+error.port],undefined,(stdout)=>{logConsole(cfg,stdout)})})})}function extractValue(val,prefix){const inner=val.split(`${prefix}=`)[1]?.split(' ')[0]?.trim();return inner||null}function getBashParameters(cfg){const argvArray=process.argv.slice(2);const paramActions={'--ssl':()=>{cfg.isUseHTTPs=true},'--isUseHTTPs':(val)=>{cfg.isUseHTTPs=extractValue(val,'--isUseHTTPs')==='true'},'--autoRebootServerOnFailure=true':()=>{cfg.autoRebootServerOnFailure=true},'--port':(val)=>{cfg.port=extractValue(val,'--port')},'--dirPath':(val)=>{cfg.dirPath=extractValue(val,'--dirPath')},'--homePage':(val)=>{cfg.homePage=extractValue(val,'--homePage')},'--enableAdmin=true':()=>{cfg.enableAdmin=true},'--adminUserName':(val)=>{cfg.adminUserName=extractValue(val,'--adminUserName')},'--adminPassword':(val)=>{cfg.adminPassword=extractValue(val,'--adminPassword')},'--sslKey':(val)=>{cfg.sslKey=extractValue(val,'--sslKey')},'--sslCert':(val)=>{cfg.sslCert=extractValue(val,'--sslCert')},'--sslCabundle':(val)=>{cfg.sslCabundle=extractValue(val,'--sslCabundle')},'--version':()=>{const json=require(path.join(__dirname,'package.json'));console.log('\n');console.log(BASH_COLORS_HELPER.getYellowFG(),`\t${json.version}`);process.exit(1)},'--dependencies':()=>{const json=require(path.join(__dirname,'package.json'));console.log('\n');console.log(BASH_COLORS_HELPER.getYellowFG(),'dependencies:');console.log(JSON.stringify(json.dependencies,null,'\t'));console.log('\n');console.log(BASH_COLORS_HELPER.getYellowFG(),'devDependencies:');console.log(JSON.stringify(json.devDependencies,null,'\t'));process.exit(1)},'--help':()=>{displayHelpText();process.exit(1)}};argvArray.forEach((val)=>{const actionKey=Object.keys(paramActions).find((key)=>val.startsWith(key));if(actionKey){paramActions[actionKey](val)}});return cfg}function displayHelpText(){const yellow=BASH_COLORS_HELPER.getYellowFG();console.log('\n');console.log('You can manage configuration in the "config.json" file.');console.log('\n');console.log(yellow,'Or use following commands:');console.log('\tnode server.js');console.log('\tnode server.js',yellow,'--port=9002');console.log('\tnode server.js',yellow,'--port=9002 --ssl');console.log('\tnode server.js',yellow,'--port=9002 --ssl --sslKey=/home/ssl/ssl.key --sslCert=/home/ssl/ssl.crt');console.log('\n');console.log('Here is list of all config parameters:');const helpItems=[{param:'--port=80',desc:'This parameter allows you set any custom port.'},{param:'--ssl',desc:'This parameter is shortcut for --isUseHTTPs=true'},{param:'--isUseHTTPs=true',desc:'This parameter allows you force HTTPs. Remove/Skip/Ignore this parameter to use HTTP.'},{param:'--sslKey=path',desc:'This parameter allows you set your domain\'s .key file.'},{param:'--sslCert=path',desc:'This parameter allows you set your domain\'s .crt file.'},{param:'--sslCabundle=path',desc:'This parameter allows you set your domain\'s .cab file.'},{param:'--version',desc:'Check RTCMultiConnection version number.'},{param:'--dependencies',desc:'Check all RTCMultiConnection dependencies.'},{param:'--autoRebootServerOnFailure=false',desc:'Disable auto-restart server.js on failure.'},{param:'--dirPath=/var/www/html/',desc:'Directory path that is used for HTML/CSS/JS content delivery.'},{param:'--homePage=/demos/Video-Conferencing.html',desc:'Open a specific demo instead of loading list of demos.'},{param:'--enableAdmin=true',desc:'Enable /admin/ page.'},{param:'--adminUserName=username',desc:'/admin/ page\'s username.'},{param:'--adminPassword=password',desc:'/admin/ page\'s password.'}];helpItems.forEach(item=>{console.log(yellow,item.param);console.log(`\t${item.desc}`)});console.log('------------------------------');console.log('Need more help?')}function ensureDirectoryExistence(filePath){const dirname=path.dirname(filePath);if(fs.existsSync(dirname)){return true}ensureDirectoryExistence(dirname);fs.mkdirSync(dirname);return true}function assignValue(res,cfg,k,def=null){if(cfg[k]!==undefined&&cfg[k]!==null&&cfg[k]!==''){res[k]=cfg[k]}else if(def!==null){res[k]=def}}function getValues(param){const defaultConfig={socketURL:'/',dirPath:null,homePage:'/demos/index.html',socketMessageEvent:'RTCMultiConnection-Message',socketCustomEvent:'RTCMultiConnection-Custom-Message',port:process.env.PORT||9001,enableLogs:false,autoRebootServerOnFailure:false,isUseHTTPs:null,sslKey:null,sslCert:null,sslCabundle:null,enableAdmin:false,adminUserName:null,adminPassword:null};if(!fs.existsSync(param.config)){console.log('File does not exist, creating it...',param.config);ensureDirectoryExistence(param.config);fs.writeFileSync(param.config,JSON.stringify(defaultConfig,null,4));return defaultConfig}const config=getJsonFile(param.config);const result={...defaultConfig};Object.keys(defaultConfig).forEach(key=>{assignValue(result,config,key,defaultConfig[key])});['sslKey','sslCert','sslCabundle'].forEach((key)=>{if(config[key]&&config[key].toString().length>0&&!config[key].includes('/path/to/')){result[key]=config[key]}});return result}class User{constructor(data,s,maxR){this.id=data.userid;this.broadcastId=data.broadcastId;this.isInitiator=false;this.maxRelays=maxR;this.receivers=[];this.source=null;this.canRelay=false;this.streams=data.typeOfStreams||{audio:true,video:true};this.socket=s}}class BroadcastManager{constructor(cfg,maxR=2){this.users={};this.config=cfg;this.maxRelays=parseInt(maxR)||2}setupSocket(s){s.on('join-broadcast',(data)=>this.handleJoin(s,data));s.on('scalable-broadcast-message',(m)=>this.relayMessage(s,m));s.on('can-relay-broadcast',()=>this.setRelayStatus(s,true));s.on('can-not-relay-broadcast',()=>this.setRelayStatus(s,false));s.on('check-broadcast-presence',(uid,cb)=>this.checkPresence(uid,cb));s.on('get-number-of-users-in-specific-broadcast',(bid,cb)=>this.getViewerCount(bid,cb));s.ondisconnect=()=>this.handleDisconnect(s);return{getUsers:()=>this.getUsersList()}}handleJoin(s,data){try{if(this.users[data.userid]){console.warn(`User ${data.userid} already exists in broadcast ${data.broadcastId}`);return}s.userid=data.userid;s.isScalableBroadcastSocket=true;this.users[data.userid]=new User(data,s,this.maxRelays);const relayer=this.findAvailableRelayer(data.broadcastId);if(relayer==='ask-him-rejoin'){s.emit('rejoin-broadcast',data.broadcastId);return}if(relayer&&data.userid!==data.broadcastId){this.connectToRelayer(data.userid,relayer)}else{this.setupInitiator(data.userid)}this.notifyViewerCount(data.broadcastId)}catch(error){pushLogs(this.config,'join-broadcast',error)}}connectToRelayer(userId,relayer){const viewer=this.users[userId];const joinInfo={typeOfStreams:relayer.streams,userid:relayer.id,broadcastId:relayer.broadcastId};viewer.source=relayer.id;relayer.receivers.push(viewer);if(this.users[viewer.broadcastId]){this.users[viewer.broadcastId].lastRelayId=relayer.id}viewer.socket.emit('join-broadcaster',joinInfo);viewer.socket.emit('logs',`You <${viewer.id}> are receiving data from <${relayer.id}>`);relayer.socket.emit('logs',`You <${relayer.id}> are relaying data to <${viewer.id}>`)}setupInitiator(userId){const user=this.users[userId];user.isInitiator=true;user.socket.emit('start-broadcasting',user.streams);user.socket.emit('logs',`You <${user.id}> are serving the broadcast.`)}relayMessage(s,m){s.broadcast.emit('scalable-broadcast-message',m)}setRelayStatus(s,status){if(this.users[s.userid]){this.users[s.userid].canRelay=status}}checkPresence(uid,cb){try{cb(Boolean(this.users[uid]?.isInitiator))}catch(error){pushLogs(this.config,'check-broadcast-presence',error)}}getViewerCount(bid,cb){try{if(!bid||!cb)return;if(!this.users[bid]){cb(0);return}cb(this.countViewers(bid))}catch(error){cb(0)}}countViewers(bid){try{let count=0;Object.values(this.users).forEach(user=>{if(user.broadcastId===bid){count++}});return Math.max(0,count-1)}catch(error){return 0}}notifyViewerCount(bid,userLeft=false){try{const initiator=this.users[bid];if(!bid||!initiator||!initiator.socket)return;let count=this.countViewers(bid);if(userLeft)count--;initiator.socket.emit('number-of-broadcast-viewers-updated',{numberOfBroadcastViewers:count,broadcastId:bid})}catch(error){}}handleDisconnect(s){try{if(!s.isScalableBroadcastSocket)return;const user=this.users[s.userid];if(!user)return;if(!user.isInitiator){this.notifyViewerCount(user.broadcastId,true)}if(user.isInitiator){this.stopBroadcast(user.broadcastId);delete this.users[s.userid];return}if(user.source){const source=this.users[user.source];if(source){source.receivers=source.receivers.filter(r=>r.id!==user.id)}}if(user.receivers.length&&!user.isInitiator){this.reconnectViewers(user.receivers)}delete this.users[s.userid]}catch(error){pushLogs(this.config,'scalable-broadcast-disconnect',error)}}stopBroadcast(bid){Object.values(this.users).forEach(user=>{if(user.broadcastId===bid){user.socket.emit('broadcast-stopped',bid)}})}reconnectViewers(recvs){try{recvs.forEach(receiver=>{if(this.users[receiver.id]){this.users[receiver.id].canRelay=false;this.users[receiver.id].source=null;receiver.socket.emit('rejoin-broadcast',receiver.broadcastId)}})}catch(error){pushLogs(this.config,'reconnectViewers',error)}}findAvailableRelayer(bid){try{const initiator=this.users[bid];if(initiator&&initiator.receivers.length<this.maxRelays){return initiator}if(initiator&&initiator.lastRelayId){const lastRelay=this.users[initiator.lastRelayId];if(lastRelay&&lastRelay.receivers.length<this.maxRelays){return lastRelay}}for(const id in this.users){const user=this.users[id];if(user.broadcastId===bid&&user.receivers.length<this.maxRelays&&user.canRelay){return user}}return initiator}catch(error){pushLogs(this.config,'findAvailableRelayer',error);return null}}getUsersList(){try{const list=[];Object.values(this.users).forEach(user=>{if(!user)return;try{list.push({userid:user.id,broadcastId:user.broadcastId,isBroadcastInitiator:user.isInitiator,maxRelayLimitPerUser:user.maxRelays,relayReceivers:user.receivers.map(r=>r.id),receivingFrom:user.source,canRelay:user.canRelay,typeOfStreams:user.streams})}catch(error){pushLogs(this.config,'getUsersList-item',error)}});return list}catch(error){pushLogs(this.config,'getUsersList',error);return[]}} }function createBroadcastHandler(cfg,s,maxR){const manager=new BroadcastManager(cfg,maxR);return manager.setupSocket(s)}export{after_http_listen,before_http_listen,getBashParameters,getValues,createBroadcastHandler};