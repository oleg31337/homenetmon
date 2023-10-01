import redis from 'redis';
const client = redis.createClient({url:'redis://docker.local:6379'});

client.on('error', err => console.log('Redis Client Error', err));
const host1 = {name:"server1",ip:'192.168.10.10',mac:'a1:b2:c3:d4:e5:f6',alive:1,latency:0.33,ports:''};
const host2 = {name:"server2",ip:'192.168.20.20',mac:'a2:b3:c4:d5:e6:f7',alive:0,latency:-1,ports:''};

await client.connect();

//await client.del('hashkey1');
await client.hSet('hostmac:'+host1.mac, host1);
await client.hSet('hostmac:'+host2.mac, host2);
var keys=await client.keys('hostmac:*');
console.log(keys);
//console.log(typeof(keys));
//wait client.hSet('hostmac:'+host2.mac, host2);
//await client.json.set('hostmac:'+host2.mac,'$', {name:"server2",ip:'192.168.20.20',mac:'a2:b3:c4:d5:e6:f7',alive:0,latency:-1,ports:[1,2,3,4,5]});
var value = await client.hGetAll('hostmac:'+host1.mac);
//console.log(host1);
console.log(value);
//await client.hSet('hashkey1', 'anotherkey', "new value!");
client.quit();