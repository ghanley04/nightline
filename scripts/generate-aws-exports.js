const fs = require('fs');
const path = require('path');

// Read values from environment variables
const config = {
  aws_project_region: process.env.AWS_PROJECT_REGION,
  aws_appsync_graphqlEndpoint: process.env.AWS_APPSYNC_GRAPHQLENDPOINT,
  aws_appsync_region: process.env.AWS_APPSYNC_REGION,
  aws_appsync_authenticationType: process.env.AWS_APPSYNC_AUTH_TYPE,
  aws_appsync_apiKey: process.env.AWS_APPSYNC_API_KEY,
};

// Output file
const outputPath = path.join(__dirname, '../app/aws-exports.js');

fs.writeFileSync(
  outputPath,
  `const awsmobile = ${JSON.stringify(config, null, 2)};\n\nexport default awsmobile;\n`
);

console.log('✅ aws-exports.js generated');
