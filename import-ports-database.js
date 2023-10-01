const fs = require('fs');
const csv = require('csv-parser');

const csvFilePath = './service-names-port-numbers.csv'; // Replace with the actual path to your CSV file
const jsonFilePath = './services-db.json';
const jsonData = {
  tcp: {},
  udp: {}
};

fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on('data', (row) => {
    const { name, port, protocol, desc } = row;
    if (typeof(jsonData[protocol][port]) == 'undefined'){
        jsonData[protocol][port] = { name, desc };
    }
  })
  .on('end', () => {
    fs.writeFileSync(jsonFilePath,JSON.stringify(jsonData));
    console.log(JSON.stringify(jsonData, null, 2));
  });