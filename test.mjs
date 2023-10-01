import netFunctions from './netscanner.mjs' //network scanning functions
import appUtils from './apputils.mjs'

const utils= new appUtils();
import hostDB from './hostdb.mjs';
import fs from 'fs';
const hosts = new hostDB();
const net = new netFunctions();

import redis from 'redis'



//var result;
//var result = await hosts.getHost('a1:b2:c3:d4:e5:f6');
//const globalhosts=JSON.parse(fs.readFileSync('./globalhosts.json'));
//async function importhosts() {
//  Object.keys(globalhosts).forEach((mac)=>{
//    hosts.setHost(mac, globalhosts[mac]);
//  });
//}
//console.log('test');
//var res= await net.pingHost('192.168.1.1');
//console.log('response: ', res);

//res= await net.pingArp('192.168.1.1');
//console.log('response: ', res);


//var res=await net.portScan('192.168.1.0/24','portscan',{ports:10,speed:5});
//console.log('response: ', JSON.stringify(res,null,2));

//var arr = [1,3,4,5,6,8,12,55,56,57,89];
//console.log(utils.combineConsecutiveNumbers(arr));
//var res = await net.mdnsScan(1000);
//console.log(res);
//await hosts.setAllhosts(globalhosts);
//console.log('import complete');
//var result = await hosts.getAllHosts();
//console.log(result);//JSON.stringify(result,null,2));
//console.log ('testing set and get')
//result = await hosts.set('B0:2A:43:40:D9:52','name','Google home mini');
//console.log('result '+result)
//result = await hosts.get('B0:2A:43:40:D9:52','name');
//console.log('result '+result)

const mdnsscan=await net.mdnsScan();
console.log(mdnsscan);

hosts.close();