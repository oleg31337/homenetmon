var activedimmer='\
    <p>&nbsp;</p>\
    <p>&nbsp;</p>\
    <div class="ui active dimmer">\
    <div class="ui text loader">Loading</div>\
    </div>'
var globalsetinterval={}; //global object of timeout functions
var globalnmapstatus=false; //global nmap status flag 

function ip2int(ip) { // Convert decimal number representation to IP dotted address
    var d = ip.split('.');
    return ((((((+d[0])*256)+(+d[1]))*256)+(+d[2]))*256)+(+d[3]);
}

function int2ip(num) { // Convert IP dotted address to representing decimal number
    var ip = num%256;
    for (var i = 3; i > 0; i--)
    {
        num = Math.floor(num/256);
        ip = num%256 + '.' + ip;
    }
    return ip;
}

function findinArray(arr,strng){ // Function to find string in array and return array index or -1
  for (var aidx=0;aidx<arr.length;aidx++ ){
      if (arr[aidx]==strng){
          return aidx;
      }
  }
  return -1;
}

function secondsToHms(d) {
    d = Number(d);
    var h = Math.floor(d / 3600);
    var m = Math.floor(d % 3600 / 60);
    var s = Math.floor(d % 3600 % 60);

    var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    return hDisplay + mDisplay + sDisplay; 
}

function setCookie(cname, cvalue, cexpire) { //function to set a cookie
  var expires='';
  if (typeof(cexpire) != 'undefined'){
    var d = new Date();
    d.setTime(d.getTime() + cexpire);
    expires = '; expires='+ d.toUTCString();
  }
  document.cookie = cname + '=' + cvalue + expires + '; path=/';
}

function getCookie(cname) { //function to read a single cookie value
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(';');
  for(var i = 0; i <ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return false;
}

function setClipboard(value,elem) { //function to copy specified text to clipboard and change data tooltip for 1 sec to Copied
    var tempInput = document.createElement("input");
    tempInput.style = "position: absolute; left: -1000px; top: -1000px";
    tempInput.value = value;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    elem.parentElement.setAttribute("data-tooltip","Copied");
    setTimeout(function(){elem.parentElement.setAttribute("data-tooltip","Copy");},1000);
}

function download(data, filename, type) {
    var file = new Blob([data], {type: type});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var a = document.createElement("a"),
                url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);  
        }, 0); 
    }
}

function filterTable() { // function to filter table
  var input = document.getElementById("TableFilter"); //input filter in the menu bar
  var filter = input.value.toUpperCase(); // we perform case insensitive filtering
  var table = document.getElementById("HostsTable"); //get our table to filter
  var filtercolumns = table.querySelectorAll('th.filtrable'); // get filtrable columns from table header
  var filtercolidx= []; // filtrable columns indexes;
  for (i=0; i<filtercolumns.length; i++){
    filtercolidx.push(filtercolumns[i].cellIndex);
  }
  var tbody = table.getElementsByTagName("tbody")[0]; //get table body, to exclude header from filtering
  var tr = tbody.getElementsByTagName("tr"); // get all tr elements
  for (i = 0; i < tr.length; i++) {
    td=tr[i].getElementsByTagName("td"); // get all td elements
    var matchfound=0;
    for (j=0; j<filtercolidx.length; j++){ // go through all columns that are filtrable
      var txtValue = td[filtercolidx[j]].textContent || td[filtercolidx[j]].innerText;
      if (td[filtercolidx[j]].getAttribute('textvalue')){
        txtValue=td[filtercolidx[j]].getAttribute('textvalue');
      }
      ////console.log('txtvalue=='+txtValue);
      if (txtValue.toUpperCase().indexOf(filter) > -1) {
        matchfound++;
        break; // no need to process anything else as we have a match.
      }
    }
    if (matchfound != 0){
      tr[i].style.display = "";
    } else {
      tr[i].style.display = "none";
    }
  }
}

function errorTableContents(errmsg){
  document.getElementById("TableContents").innerHTML ='<div class="ui inverted placeholder segment"><div class="ui inverted icon header"><i class="exclamation triangle icon"></i>'+errmsg+'</div></div>';
  $('#TableDimmer').removeClass('active');  
}

function getTableData(){ // get instance and volumes data from the backend
  //console.log('getTableData');
  fetch("api/gethosts").catch((error)=>{})
  .then(response => response.json())
  .then(data => {
    generateTable(data);
  })
  .catch((error)=>{
    responseDialog(undefined,['Error','Application is not available']);
    errorTableContents('Application is not available');
  });
}

function clearTableData(){
  //console.log('clearTableData');
  $('#TableDimmer').addClass('active');
}

function generateMenu(){ // build menu with accounts and regions
  //console.log('generateMenu');
  var inputfiltervalue='';
  if (document.getElementById("TableFilter") != null && document.getElementById("TableFilter").value !=''){
    inputfiltervalue = document.getElementById("TableFilter").value; //get the value of input filter in the menu bar
  }
  var menuitems='\
  <div class="ui inverted top attached menu">\
    <div class="ui simple dropdown item"><img src="/images/appicon.png"/>\
      <div class="menu">\
        <div class="item" onclick="refreshTable()"><i class="sync alternate icon"></i>Refresh table</div>\
        <div class="item" onclick="displayScanStats()"><i class="info circle icon"></i>Last scheduled scan info</div>\
        <div class="item" onclick="importexportDialog()"><i class="download icon"></i>Import/Export</div>\
        <div class="item" onclick="settingsDialog()"><i class="settings icon"></i>Settings</div>\
      </div>\
    </div>\
    <a class="item" id="rescan_button" onclick="scanDialog(false,\'subnet\')"><i class="globe icon"></i>Rescan network</a>\
    <div class="right menu">\
      <div class="item"><i class="filter icon"></i>&nbsp;<div class="ui transparent inverted input">&nbsp;<input id="TableFilter" type="text" placeholder="Filter..." onkeyup="filterTable()" onpaste="filterTable()" value="'+inputfiltervalue+'"></div></div>\
      <a class="item" onclick="document.getElementById(\'TableFilter\').value=\'\';filterTable()"><i class="trash alternate outline icon"></i>Clear<br/>filter</a>\
    </div>\
  </div>'
  document.getElementById('MainMenu').innerHTML=menuitems;
  refreshTable();
  checkNmapStatus();
  checkStatus();// check if it is a first run
  setInterval(checkNmapStatus,10000);
}

function checkStatus(){ // check if it was the first run of the app.
  fetch("api/getsettings")
    .catch((error)=>{})
    .then(resp=>resp.json())
    .then(settings=>{
      //console.log('Check status: ', settings);
      if (typeof(settings.firstrun)!='undefined' && settings.firstrun==1) {
        //console.log ('first run');
        setTimeout(function () { // delay before showing settings dialog
          checkNmapStatus(function (state){
            if (!state) settingsDialog(); //open settings dialog if nmap is not already running.
          });
        },500);
      }
    }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
}

function refreshTable(){ //refresh table data
  //console.log("refreshTable");
  clearTableData();
  getTableData();
}

async function generateTable(tabledata) { // create instances table contents
  //console.log("generateTable");
  if (Object.keys(tabledata).length==0){
    document.getElementById("TableContents").innerHTML ='<div class="ui inverted placeholder segment"><div class="ui inverted icon header"><i class="search icon"></i>There is no hosts information at this moment</div></div>';
    setTimeout(function(){refreshTable();},10000);
    $('#TableDimmer').removeClass('active');
    return;
  }
  var out = '<table id="HostsTable" class="ui sortable inverted very compact selectable celled table">\
  <thead><tr>\
  <th class="default-sort filtrable one wide">IP Address</th>\
  <th class="filtrable one wide">Detected host names</th>\
  <th class="filtrable two wide">Custom name</th>\
  <th class="filtrable one wide">MAC Address</th>\
  <th class="no-sort filtrable five wide">Detected open ports</th>\
  </tr>\
  </thead><tbody id="hoststablebody">';
  out += "</tbody></table>"
  document.getElementById("TableContents").innerHTML = out;
  
  for(var i = 0; i < Object.keys(tabledata).length; i++) {
    var mac=Object.keys(tabledata)[i];
    if (mac==null) continue;
    var host=tabledata[Object.keys(tabledata)[i]];
    if (host==null) continue;
    await updateTableRow(host);
    //finally initiate automatic refresh
    let ipaddr=host.ipaddr;
    let macaddr=mac;
    if (typeof (globalsetinterval[macaddr]) == 'number') {
      clearTimeout(globalsetinterval[macaddr]);
      delete globalsetinterval[macaddr];
    };
    globalsetinterval[macaddr]=setTimeout(function(){ requestUpdate((macaddr.toString()),(ipaddr.toString())); }, 60000-Math.floor(Math.random() * 2001));
    setTimeout(function(){ requestUpdate(macaddr,ipaddr); },5100-Math.floor(Math.random() * 5001));
    ////console.log(typeof(globalsetinterval[j]));
    ////console.log(globalsetinterval[j]);
  }
  $('table').tablesort().data('tablesort').sort($("th.default-sort"));
  filterTable();
  $('#TableDimmer').removeClass('active');
}

async function updateTableRow(host,callback){
  //console.log("updateTableRow");
  //console.log(host);
  if (host==null) return;
  mac=host.mac;
  tbody=document.getElementById("hoststablebody");
  if (!document.getElementById(host.ipaddr)){
    var tablerow=tbody.insertRow();
    tablerow.setAttribute("class", "filtrabletr");
    tablerow.id=host.ipaddr;
  }
  else {
    tablerow=document.getElementById(host.ipaddr);
  }
  
  var latencytext = 'Latency: '+parseFloat(host.latency).toFixed(1);
  if (host.latency < 0) latencytext='Unreachable';
  
  var avail_color="red"; //default availability label color for unreachable hosts
  if (host.latency>=0){
    avail_color="blue";
  }
  if (host.latency>=10){
    avail_color="green";
  }
  if (host.latency>=20){
    avail_color="olive";
  }
  if (host.latency>=50){
    avail_color="yellow";
  }
  if (host.latency>=100){
    avail_color="orange";
  }
  var portslist=''; // generate list of ports
  var portslistfilter='';
  //console.log(host);
  if (Object.keys(host.ports.tcp).length > 0 || Object.keys(host.ports.udp).length > 0){
    var ports_tcp=[];
    var ports_udp=[];
    var ports_tcp_filter=[];
    var ports_udp_filter=[];
    for (var i=0;i<Object.keys(host.ports.tcp).length;i++){
      const port=parseInt(Object.keys(host.ports.tcp)[i]);
      const service=host.ports.tcp[port].name;
      const description=host.ports.tcp[port].desc;
      var proto='none'; //protocol handlers
        if (port == 21){
          proto='ftp';
        }
        else if (port == 22){
          proto='ssh';
        }
        else if (port == 23){
          proto='telnet';
        }
        else if (findinArray([80,1880,8008,8009,8080,8081,8082,8083,8084,8085,8086,8087,8088,8089,10080,10088,30450],port)>=0){
          proto='http';
        }
        else if (findinArray([443,8006,8443,8444,9443,10443],port)>=0){
          proto='https';
        }
        else if (findinArray([554,8554],port)>=0){
          proto='rtsp';
        }
      if (proto !='none') ports_tcp.push('&nbsp;<span class="ui" data-tooltip="'+service+', '+description+'" data-variation="mini" data-inverted=""><a target="_blank" href="'+proto+'://'+host.ipaddr+':'+port+'">'+port+'</a></span>');
      else ports_tcp.push('&nbsp;<span class="ui" data-tooltip="'+service+', '+description+'" data-variation="mini" data-inverted="">'+port+'</span>');
      ports_tcp_filter.push(service+port+'tcp');
    }
    for (var i=0;i<Object.keys(host.ports.udp).length;i++){
      const port=Object.keys(host.ports.udp)[i];
      const service=host.ports.udp[port].name;
      const description=host.ports.udp[port].desc;
      ports_udp.push('&nbsp;<span class="ui" data-tooltip="'+service+', '+description+'" data-variation="mini" data-inverted="">'+port+'</span>');
      ports_udp_filter.push(service+port+'udp');
    }
    if (ports_tcp.length>0){
      portslist+='TCP: '+ports_tcp.join(", ");
      portslistfilter+=ports_tcp_filter.join(" ");
    }
    if (ports_udp.length>0){
      portslist+='<br/>UDP: '+ports_udp.join(", ");
      portslistfilter+=' '+ports_udp_filter.join(" ");
    }
  }
  else {
    portslist='No open ports found yet. Try more ports in scope or lower the speed.';
  }
  if (parseInt(host.scanning) == 1){
    //vail_color="gray";
    portslist='<div class="ui inline active inline loader"></div>&nbsp;&nbsp;&nbsp;Scanning is in progress';
  }
  //now generate main table
  var out='<td data-sort-value="'+ip2int(host.ipaddr)+'" textvalue="'+host.ipaddr+'">'+host.ipaddr+'&nbsp;\
  &nbsp;<span class="ui" data-tooltip="Copy" data-variation="mini" data-inverted=""><i class="ui copy outline icon link" onclick="setClipboard(\''+host.ipaddr+'\',this)"></i></span>\
  </br><span class="ui" data-tooltip="Rescan" data-variation="mini" data-inverted=""><i class="ui sync alternate icon link" onclick="scanDialog(\''+mac+'\',\''+host.ipaddr+'\')"></i></span>\
  &nbsp;<span class="ui" data-tooltip="'+latencytext+'" data-variation="mini" data-inverted=""><i class="ui heartbeat alternate icon link '+avail_color+'" onclick="requestUpdate(\''+mac+'\',\''+host.ipaddr+'\')"></i></span>\
  &nbsp;<span class="ui" data-tooltip="Delete" data-variation="mini" data-inverted=""><i class="ui x icon link" onclick="confirmDelete(\''+mac+'\',\''+host.ipaddr+'\')"></i></span>\
  </td>';

  var detectednames=[];
  if (typeof(host.netbiosname)!='undefined' && host.netbiosname !='') detectednames.push(host.netbiosname);
  if (typeof(host.mdnsname)!='undefined' && host.mdnsname !='') detectednames.push(host.mdnsname);
  if (typeof(host.mdnshostname)!='undefined' && host.mdnshostname !='') detectednames.push(host.mdnshostname);
  detectednames=detectednames.concat(host.dnsnames);
  var datasortnames = detectednames.join(' ');
  if (datasortnames == ""){ datasortnames='zzzzzzzzzzzzzzzzzzzz'};
  out+='<td data-sort-value="'+datasortnames+'">'+detectednames.join(', ')+'</td>';

  var hostname = host.name ? host.name.toString().trim() : '';
  var datasorthostname = hostname;
  if (datasorthostname == ""){ datasorthostname='zzzzzzzzzzzzzzzzzzzz'};
  out+='<td data-sort-value="'+datasorthostname+'" textvalue="'+hostname+'"><div class="ui inverted transparent input"><input placeholder="Noname" type="text" onkeyup="changeName(this,event,\''+mac+'\',this.value)" value="'+hostname+'"></div></td>';
  var vendor = host.vendor ? host.vendor : '';
  if (vendor.toLowerCase == 'unknown') vendor='';
  var vendortext=''
  if (vendor !='') vendortext='</br>Vendor: '+vendor;
  out+='<td textvalue="'+mac+' '+vendor+'">'+mac+'&nbsp;<span class="ui" data-tooltip="Copy" data-variation="mini" data-inverted=""><i class="ui copy outline icon link" onclick="setClipboard(\''+mac+'\',this)"></i></span>'+vendortext+'</td>';
  out+='<td textvalue=" '+portslistfilter+' ">'+portslist+'</td>';
  tablerow.innerHTML = out;
  if (typeof(callback)=='function'){ callback(host); }
}

function checkNmapStatus(callback){ // check nmap running state
  //console.log('checkNmapStatus');
  fetch("api/getnmaprun").catch((error)=>{})
  .then(response => response.json())
  .then(data => {
    if (data) {
      if (data.msg=='ok'){
        document.getElementById("rescan_button").innerHTML='<i class="globe icon"></i>Rescan network'
        if (globalnmapstatus){
          refreshTable();
          globalnmapstatus=false;
        }
        if (typeof(callback)=='function'){ callback(false); }
      }
      else {
        document.getElementById("rescan_button").innerHTML='<div class="ui active inline loader"></div>&nbsp;&nbsp;&nbsp;Scanning is in progress';
        globalnmapstatus=true;
        if (typeof(callback)=='function'){ callback(true); }
      }
    }
    else {
      document.getElementById("rescan_button").innerHTML='<i class="x icon"></i>App is unavailable';
    }
  })
  .catch((error)=>{
    //console.warn (error);
    document.getElementById("rescan_button").innerHTML='<i class="x icon"></i>App is unavailable';
  });
}

function changeName(elem,evt,mac,newname){
  if (evt.key == 'Enter') {
    //console.log('changeName');
    ////console.log(mac,newname);
    postData('api/setname',{'mac':mac,'newname':newname}).then (data => {
      ////console.log(data);
      if (typeof data.msg !='undefined'){
        elem.parentElement.parentElement.setAttribute('textvalue',newname);
        elem.blur();
        ////console.log(data.msg);
      }
      else {
        responseDialog(undefined,data.err);
      }
    });
  }
}

async function postData(url = '', data = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return response.json();
}

function requestUpdate(macaddr,ipaddr){
  //console.log('requestUpdate');
  if (typeof (globalsetinterval[macaddr]) == 'number') {
    clearTimeout(globalsetinterval[macaddr]);
    delete globalsetinterval[macaddr];
  };
  document.getElementById(ipaddr).getElementsByClassName("ui heartbeat alternate icon link")[0].className="ui heartbeat alternate icon link gray";
  //console.log(macaddr,ipaddr);
  fetch("api/gethost?address="+macaddr)
  .catch((error)=>{})
  .then(resp=>resp.json()).then(data=>{
    updateTableRow(data);
    globalsetinterval[macaddr]=setTimeout(function(){ requestUpdate((macaddr.toString()),(ipaddr.toString())); }, 60000-Math.floor(Math.random() * 2001));
  })
  .catch((error)=>{});
}

function confirmDelete(macaddr,ipaddr){
  //console.log('confirmDelete');
  confirmDialog("Delete "+macaddr,"Are you sure you want to delete this host?","requestDelete('"+macaddr+"','"+ipaddr+"')");
}

function requestDelete(macaddr,ipaddr){
  //console.log('requestDelete');
  macaddr=macaddr.trim();
  ipaddr=ipaddr.trim();
  ////console.log([macaddr,ipaddr]);
  postData('api/deletehost',{'mac':macaddr,'ip':ipaddr}).then (data => {
    ////console.log(data);
    if (typeof(data.msg) !='undefined'){
      if (typeof (globalsetinterval[macaddr]) == 'number') {
        clearTimeout(globalsetinterval[macaddr]);
        delete globalsetinterval[macaddr];
      };
      ////console.log(data.msg);
      document.getElementById(ipaddr).remove();
    }
    else {
      responseDialog(undefined,data.err);
    }
  }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
}

function requestRescan(macaddr,ipaddr,options){
  //console.log('requestRescan');
  if (ipaddr !='subnet'){
    document.getElementById(ipaddr).children[4].innerHTML='<div class="ui inline active inline loader"></div>&nbsp;&nbsp;&nbsp;Scanning is in progress'
    if (typeof (globalsetinterval[macaddr]) == 'number') {
      clearTimeout(globalsetinterval[macaddr]);
      delete globalsetinterval[macaddr];
    };
  }
  document.getElementById("rescan_button").innerHTML='<div class="ui inline active inline loader"></div>&nbsp;&nbsp;&nbsp;Scanning is in progress';
  ////console.log(mac,name);
  
  postData('api/netscan',{'ip':ipaddr,'options':options}).then (data => {
    ////console.log(data);
    if (typeof(data.msg) !='undefined'){
      ////console.log(data.msg)
      if (ipaddr =='subnet') responseDialog(data.msg,undefined);
    }
    else {
      responseDialog(undefined,data.err);
      if (ipaddr !='subnet') requestUpdate(macaddr,ipaddr);
      return;
    }
  }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);console.warn(error);});
  if (ipaddr !='subnet') globalsetinterval[macaddr]=setTimeout(function(){ requestUpdate((macaddr.toString()),(ipaddr.toString())); }, 1000);
}

function confirmDialog(title,question,funct){ // confirmation dialog
    document.getElementById('modal_contents').setAttribute("class", "ui mini modal");
    document.getElementById('modal_contents').setAttribute("style", "");
    document.getElementById('modal_contents').innerHTML='\
        <div class="ui header">'+title+'</div>\
        <div class="content">'+question+'</div>\
        <div class="ui actions">\
          <div class="ui green ok button" onclick="'+funct+'">Yes</div>\
          <div class="ui red deny button">Cancel</div>\
        </div>';
    $('.ui.mini.modal').modal('setting', 'closable', true);
    $('.ui.mini.modal').modal('show');
}

function responseDialog(message,error){ // response and error dialog
  document.getElementById('modal_contents').setAttribute("class", "ui mini modal");
  document.getElementById('modal_contents').setAttribute("style", "");
  if (typeof error !== 'undefined') {
    document.getElementById('modal_contents').innerHTML='\
    <h2 class="ui header"><i class="exclamation triangle icon"></i>'+error[0]+'</h2><div class="content">'+error[1]+'</div>\
    <div class="ui actions">\
      <div class="ui green ok button">OK</div>\
    </div>';
  } else if (typeof message !== 'undefined') {
    document.getElementById('modal_contents').innerHTML='\
    <h2 class="ui header"><i class="thumbs up icon"></i>'+message[0]+'</h2><div class="content">'+message[1]+'</div>\
    <div class="ui actions">\
      <div class="ui green ok button">OK</div>\
    </div>';
  }
  $('.ui.mini.modal').modal('setting', 'closable', true);
  $('.ui.mini.modal').modal('show');
}

function displayScanStats(){ // show last scan stats
  document.getElementById('modal_contents').setAttribute("class", "ui large modal");
  document.getElementById('modal_contents').setAttribute("style", "background-color:#4d4d4d; color:#f2f2f2");
  fetch("api/getlastscan")
    .catch((error)=>{})
    .then(resp=>resp.json())
    .then(scanstats=>{
      var contents='<div class="header" style="background-color:#4d4d4d; color:#f2f2f2">Last full network scan information</div>\
        <table class="ui inverted very compact celled table">\
        <tr><td>Scan started</td><td>'+scanstats.runstats.startstr+'</td></tr>\
        <tr><td>Scan finished</td><td>'+scanstats.runstats.timestr+'</td></tr>\
        <tr><td>Time elapsed</td><td>'+secondsToHms(scanstats.runstats.elapsed)+'</td></tr>\
        <tr><td>Hosts scanned</td><td>'+scanstats.hosts.total+'</td></tr>\
        <tr><td>Hosts online</td><td>'+scanstats.hosts.up+'</td></tr>\
        <tr><td>Nmap command line</td><td>'+scanstats.runstats.args+'</td></tr>\
        </table>\
        <div class="actions" style="background-color:#4d4d4d; color:#f2f2f2">\
            <div class="ui black deny right button">Close</div>\
        </div>';
      document.getElementById('modal_contents').innerHTML=contents;
    }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
  document.getElementById('modal_contents').innerHTML=activedimmer+'</br><div class="actions"><div class="ui black deny right button">Close</div></div>;';
  $('.ui.large.modal').modal('setting', 'closable', true);
  $('.ui.large.modal').modal('show');
}

function settingsDialog(){ // show settings dialog
  document.getElementById('modal_contents').setAttribute("class", "ui tiny modal");
  document.getElementById('modal_contents').setAttribute("style", "background-color:#4d4d4d; color:#f2f2f2");
  fetch("api/getsettings")
    .catch((error)=>{})
    .then(resp=>resp.json())
    .then(settings=>{
      //console.log(settings);
      var netmask=settings.netmask ? settings.netmask : '24';
      var subnet=settings.subnet ? settings.subnet+'/'+netmask : '192.168.1.0/'+netmask;
      var speed=settings.speed ? settings.speed : 5;
      var ports=settings.ports ? settings.ports : '1000';
      var cronexpr=settings.cronexpr ? settings.cronexpr : '0 3 * * *';
      var cronenable=settings.cronenable ? settings.cronenable : false;
      var subnets=settings.localsubnet ? settings.localsubnet : ['192.168.1.0/24'];
      var contents='<div class="ui header" style="background-color:#4d4d4d; color:#f2f2f2"><i class="settings icon"></i>&nbsp;Settings</div>\
        <div class="content" style="background-color:#4d4d4d; color:#f2f2f2">\
          <form class="ui form segment" action="/api/savesettings" method="post" style="background-color:#4d4d4d; color:#f2f2f2">\
          <h4 class="ui dividing header" style="color:#f2f2f2">Network settings</h4>\
            <div class="two fields">\
              <div class="field">\
                <label style="color:#f2f2f2">Subnet address</label>\
                <select class="ui fluid dropdown" id="input_subnet" name="subnet" onchange="document.getElementById(\'input_netmask\').value = document.getElementById(\'input_subnet\').value.split(\'/\')[1]">';
      for (var i=0;i<subnets.length;i++){
        contents+='<option value="'+subnets[i]+'">'+subnets[i].split("/")[0]+'</option>';
      }
      contents+='</select>\
              </div>\
              <div class="field">\
                <label style="color:#f2f2f2">Netmask</label>\
                <input type="text" id="input_netmask" placeholder="24" name="netmask">\
              </div>\
            </div>\
            <h4 class="ui dividing header" style="color:#f2f2f2">Scheduled scan settings</h4>\
            <div class="field">\
                <div class="field">\
                  <label style="color:#f2f2f2">Scheduled scan time</label>\
                  <input type="text" id="input_cron" placeholder="0 0 * * *" name="cronexpr">\
                  <label style="color:#f2f2f2">(Cron expression: minute hour day month weekday)</label>\
                </div>\
            </div>\
            <div class="two fields">\
                <div class="field">\
                <label style="color:#f2f2f2">Scan speed</label>\
                <select class="ui fluid dropdown" id="select_speed" name="speed">\
                  <option value="5">Fast (may skip ports)</option>\
                  <option value="4">Normal (might skip ports)</option>\
                  <option value="3">Slow (thorough)</option>\
                </select>\
                </div>\
                <div class="field">\
                <label style="color:#f2f2f2">Number of ports</label>\
                <select class="ui fluid dropdown" id="select_ports" name="ports">\
                  <option value="10">top 10 ports (fastest)</option>\
                  <option value="100">top 100 ports (fastest)</option>\
                  <option value="1000">top 1000 ports (fast)</option>\
                  <option value="1500">top 1500 ports (moderate)</option>\
                  <option value="2000">top 2000 ports (slower)</option>\
                  <option value="5000">top 5000 ports (slow)</option>\
                  <option value="10000">top 10000 ports (very slow)</option>\
                  <option value="65534">All popular ports (insanely slow)</option>\
                  <option value="65535">All 65535 ports (insanely slow)</option>\
                </select>\
                </div>\
            </div>\
            <div class="field">\
              <div class="field">\
              <div class="ui toggle checkbox">\
                <input type="checkbox" tabindex="0" id="checkbox_cron" checked=true name="cronenable">\
                <label style="color:#f2f2f2 !important">Enable scheduled scan</label>\
              </div>\
              </div>\
            </div>';
      console.log(settings.firstrun);
      if (typeof(settings.firstrun)!='undefined' && settings.firstrun==1) contents+='<input type="checkbox" hidden checked=true name="firstrun">'
      contents+='</form>\
        </div>\
        <div class="ui actions"  style="background-color:#4d4d4d; color:#f2f2f2">\
          <div class="ui green button" onclick="submitForm()">Apply</div>\
          <div class="ui red cancel button">Cancel</div>\
        </div>';
      document.getElementById('modal_contents').innerHTML=contents;
      activateSettingsForm();
      document.getElementById('input_subnet').value=subnet;
      document.getElementById('input_netmask').value=netmask;
      document.getElementById('select_speed').value=speed;
      document.getElementById('select_ports').value=ports;
      document.getElementById('input_cron').value=cronexpr;
      document.getElementById('checkbox_cron').checked=cronenable;
    }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
  document.getElementById('modal_contents').innerHTML=activedimmer+'</br><div class="actions"><div class="ui black deny right button">Close</div></div>;';
  $('.ui.tiny.modal').modal('setting', 'closable', false);
  $('.ui.tiny.modal').modal('show');
}
function activateSettingsForm() {
    //console.warn('activateForm');
    $('.ui.form').form({
    on: 'blur',
    inline: true,
    fields: {
      cronexpr:{
        identifier: 'cronexpr',
        rules: [{
          type: 'regExp',
          value: /^((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5})$/,
          prompt: 'Please enter a valid cron expression'
        }]
      },
      netmask:{
        identifier: 'netmask',
        rules: [{
          type: 'regExp',
          value: /(^([8-9]|0[8-9]|[1-2][0-9]|3[0-2])$)|(^(((255\.){3}(255|254|252|248|240|224|192|128|0+))|((255\.){2}(255|254|252|248|240|224|192|128|0+)\.0)|((255\.)(255|254|252|248|240|224|192|128|0+)(\.0+){2})|((255|254|252|248|240|224|192|128|0+)(\.0+){3}))$)/,
          prompt: 'Please enter a valid netmask'
        }]
      }
    }
    });
}
function submitForm(){
  //console.log('submitForm');
  $('.ui.form.segment').form('submit');
}
function loadHostsJSON(elem){
  var file=elem.files[0];
  var reader = new FileReader();
  reader.readAsText(file,'UTF-8');
  reader.onload = readerEvent => {
    var content = JSON.parse(readerEvent.target.result);
    postData('api/importhostsjson',content).then (data => {
      $('.ui.tiny.modal').modal('hide');
      if (typeof data.msg !='undefined'){
        refreshTable();
        responseDialog(data.msg,undefined);
      }
      else if (typeof data.err !='undefined'){
        responseDialog(undefined,data.err);
      }
      else {
        responseDialog(undefined,["Error","Error importing hosts file"]);
      }
    })
    .catch((error)=>{responseDialog(undefined,["Error","Error importing hosts file</br>"+error]);});
  }
}

function importexportDialog(){ // show import/export dialog
  document.getElementById('modal_contents').setAttribute("class", "ui tiny modal");
  document.getElementById('modal_contents').setAttribute("style", "background-color:#4d4d4d; color:#f2f2f2");
  var contents='\
  <div class="ui header" style="background-color:#4d4d4d; color:#f2f2f2"><i class="download icon"></i>&nbsp;Import/Export</div>\
    <div class="content" style="background-color:#4d4d4d; color:#f2f2f2">\
      Export hosts data as:&nbsp;&nbsp;\
      <div class="ui button" onclick="saveHostsJSON()">JSON</div>\
      <div class="ui button" onclick="saveHostsCSV()">CSV</div>\
      </br>\
      <input type="file" id="input-file" name="input-file" accept=".json,text/json" onchange="loadHostsJSON(this)" style="display: none" />\
      </br>\
      Import hosts data as:&nbsp;&nbsp;\
      <div class="ui button" onclick="getElementById(\'input-file\').click()">JSON</div>\
    </div>\
    <div class="ui actions"  style="background-color:#4d4d4d; color:#f2f2f2">\
      <div class="ui grey cancel button">Close</div>\
    </div>';
  document.getElementById('modal_contents').innerHTML=contents;
  //activateSettingsForm();
  $('.ui.tiny.modal').modal('setting', 'closable', true);
  $('.ui.tiny.modal').modal('show');
}
function saveHostsJSON(){ 
  //console.log('saveHostsJSON');
  fetch("api/gethosts").catch((error)=>{})
  .then(response => response.json())
  .then(data => {
    download(JSON.stringify(data,null,2),'hosts_'+ new Date().toLocaleDateString() +'.json','text/json');
  }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
}
function saveHostsCSV(){
  //console.log('saveHostsJSON');
  fetch("api/gethosts").catch((error)=>{})
  .then(response => response.json())
  .then(data => {
    download(convertHostsCSV(data),'hosts_'+ new Date().toLocaleDateString() +'.csv','text/csv');
  }).catch((error)=>{responseDialog(undefined,['Error','Application is not available']);});
}
function convertHostsCSV(hosts){
  var csv='"IP Address","Latency","DNS Names","Detected Names","Custom name","MAC Address","Vendor","Ports TCP","Ports UDP"\r\n'
  for(var i = 0; i < Object.keys(hosts).length; i++) {
    const host=hosts[Object.keys(hosts)[i]];
    var ports_tcp=[];
    var ports_udp=[];
    for (var j=0;j<Object.keys(host.ports.tcp).length;j++){
      const port=Object.keys(host.ports.tcp)[j];
      ports_tcp.push(port);
    }
    for (var j=0;j<Object.keys(host.ports.udp).length;j++){
      const port=Object.keys(host.ports.udp)[j];
      ports_udp.push(port);
    }
    //console.log(ports_tcp);
    var alldnsnames=host.dnsnames.push(host.mdnshostname);
    var detectednames=[host.netbiosname,host.mdnsname];
    csv+='"'+[host.ipaddr,host.latency,alldnsnames.join(','),detectednames.join(','),host.name,host.mac,host.vendor,ports_tcp.join(','),ports_udp.join(',')].join('","')+'"\r\n';
  }
  return csv;
}

function scanDialog(macaddr,ipaddr){ // show scan settings dialog
  document.getElementById('modal_contents').setAttribute("class", "ui tiny modal");
  document.getElementById('modal_contents').setAttribute("style", "background-color:#4d4d4d; color:#f2f2f2");
  var speed=getCookie('scanspeed') ? getCookie('scanspeed') : '5';
  var ports=getCookie('scanports') ? getCookie('scanports') : '1000';
  if (ipaddr=='subnet') {
    speed=getCookie('scanspeedsub') ? getCookie('scanspeedsub') : '5';
    ports=getCookie('scanportssub') ? getCookie('scanportssub') : '1000';
  }
  var contents='<div class="ui header" style="background-color:#4d4d4d; color:#f2f2f2"><i class="sync alternate icon"></i>&nbsp;Scan '+ipaddr+'</div>\
    <div class="content" style="background-color:#4d4d4d; color:#f2f2f2">\
      <form class="ui form segment" style="background-color:#4d4d4d; color:#f2f2f2">\
        <input type="text" id="input_ipaddr" hidden disabled value="'+ipaddr+'" name="ipaddr">\
        <input type="text" id="input_macaddr" hidden disabled value="'+macaddr+'" name="macaddr">\
        <div class="two fields">\
            <div class="field">\
            <label style="color:#f2f2f2">Scan speed</label>\
            <select class="ui fluid dropdown" id="select_speed" name="speed">\
              <option value="5">Fast (may skip ports)</option>\
              <option value="4">Normal (might skip ports)</option>\
              <option value="3">Slow (thorough)</option>\
            </select>\
            </div>\
            <div class="field">\
            <label style="color:#f2f2f2">Number of ports</label>\
            <select class="ui fluid dropdown" id="select_ports" name="ports">'
  if (ipaddr=='subnet') contents+='<option value="0">Quick network swipe without port scan</option>'
  contents+=' <option value="10">top 10 ports (fastest)</option>\
              <option value="100">top 100 ports (fastest)</option>\
              <option value="1000">top 1000 ports (fast)</option>\
              <option value="1500">top 1500 ports (moderate)</option>\
              <option value="2000">top 2000 ports (slower)</option>\
              <option value="5000">top 5000 ports (slow)</option>\
              <option value="10000">top 10000 ports (very slow)</option>\
              <option value="65534">All popular ports (insanely slow)</option>\
              <option value="65535">All 65535 ports (insanely slow)</option>\
            </select>\
            </div>\
        </div>\
      </form>\
    </div>\
    <div class="ui actions"  style="background-color:#4d4d4d; color:#f2f2f2">\
      <div class="ui green button" onclick="submitScanForm()">Scan</div>\
      <div class="ui red cancel button">Cancel</div>\
    </div>';
  document.getElementById('modal_contents').innerHTML=contents;
  document.getElementById('select_speed').value=speed;
  document.getElementById('select_ports').value=ports;
  $('.ui.tiny.modal').modal('setting', 'closable', true);
  $('.ui.tiny.modal').modal('show');
  return;
}

function submitScanForm() {
  $('.ui.tiny.modal').modal('hide');
  var speed = document.getElementById('select_speed').value;
  var ports = document.getElementById('select_ports').value;
  var ipaddr = document.getElementById('input_ipaddr').value;
  var macaddr = document.getElementById('input_macaddr').value;
  if (ipaddr == 'subnet') {
    setCookie('scanportssub',ports,31557600000);
    setCookie('scanspeedsub',speed,31557600000);
  }
  else {
    setCookie('scanports',ports,31557600000);
    setCookie('scanspeed',speed,31557600000);
  }
  //console.log(macaddr,ipaddr,{'speed':speed,'ports':ports});
  requestRescan(macaddr,ipaddr,{'speed':speed,'ports':ports});
}

function appInit() { // main app that is called from the html page to initialize the frontend app
  //console.log('appInit');
  generateMenu();
}