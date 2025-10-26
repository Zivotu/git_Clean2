import http from 'http';

const BASE_URL = 'http://localhost:8788';
const LISTING_ID = 'test-listing'; // Assume this listing exists
const EXPECTED_BUILD_ID = 'test-build'; // Assume this is the buildId for the listing

async function runTest() {
  console.log(`Running verification for listing: ${LISTING_ID}`);

  const aliasUrl = `${BASE_URL}/${LISTING_ID}/build/manifest_v1.json`;

  // 1. Test HEAD request on the alias
  console.log(`[TEST] HEAD ${aliasUrl}`);
  const headRequest = http.request(aliasUrl, { method: 'HEAD', headers: { host: 'localhost' } }, (res) => {
    console.log(`  -> STATUS: ${res.statusCode}`);
    const location = res.headers.location;
    console.log(`  -> Location: ${location}`);

    if (res.statusCode !== 307) {
      console.error(`  [FAIL] Expected status code 307, but got ${res.statusCode}`);
      process.exit(1);
    }

    const expectedLocation = `/builds/${EXPECTED_BUILD_ID}/build/manifest_v1.json`;
    if (location !== expectedLocation) {
      console.error(`  [FAIL] Expected Location header '${expectedLocation}', but got '${location}'`);
      process.exit(1);
    }
    console.log('  [PASS] HEAD request is correct.');
    res.resume(); // Consume response data to free up memory
    testGetRequest(); // Proceed to next test
  });

  headRequest.on('error', (err) => {
    console.error('Request failed:', err);
    process.exit(1);
  });

  headRequest.end();
}

function testGetRequest() {
  const aliasUrl = `${BASE_URL}/${LISTING_ID}/build/manifest_v1.json`;
  // 2. Test GET request on the alias
  console.log(`
[TEST] GET ${aliasUrl}`);
  const getRequest = http.get(aliasUrl, { headers: { host: 'localhost' } }, (res) => {
    console.log(`  -> STATUS: ${res.statusCode}`);
    const location = res.headers.location;
    console.log(`  -> Location: ${location}`);

    if (res.statusCode !== 307) {
      console.error(`  [FAIL] Expected status code 307, but got ${res.statusCode}`);
      process.exit(1);
    }

    const expectedLocation = `/builds/${EXPECTED_BUILD_ID}/build/manifest_v1.json`;
    if (location !== expectedLocation) {
      console.error(`  [FAIL] Expected Location header '${expectedLocation}', but got '${location}'`);
      process.exit(1);
    }
    console.log('  [PASS] GET request redirect is correct.');
    res.resume();
    // 3. Test the redirected URL
    testGetRedirectedAsset(location!);
  });

  getRequest.on('error', (err) => {
    console.error('Request failed:', err);
    process.exit(1);
  });
}

function testGetRedirectedAsset(location: string) {
  const assetUrl = `${BASE_URL}${location}`;
  console.log(`
[TEST] GET ${assetUrl}`);
  const assetRequest = http.get(assetUrl, { headers: { host: 'localhost' } }, (res) => {
    console.log(`  -> STATUS: ${res.statusCode}`);
    if (res.statusCode !== 200) {
      console.error(`  [FAIL] Expected status code 200, but got ${res.statusCode}`);
      console.error('  This might mean the test data (listing/build) does not exist on the server.');
      process.exit(1);
    }
    console.log('  [PASS] Successfully fetched the asset.');
    res.resume();
    console.log('
All tests passed!');
  });

  assetRequest.on('error', (err) => {
    console.error('Request failed:', err);
    process.exit(1);
  });
}

runTest();
