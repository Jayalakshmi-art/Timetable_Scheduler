async function testFeasibility() {
  try {
    const instResponse = await fetch('http://localhost:5000/api/institutions');
    const institutions = await instResponse.json();
    if (!institutions.length) {
      console.log('No institutions found. Skipping feasibility test.');
      return;
    }
    const instId = institutions[0].id;
    console.log('Testing feasibility for institution:', instId);

    const checkResponse = await fetch('http://localhost:5000/api/timetable/feasibility-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institution_id: instId })
    });
    
    if (!checkResponse.ok) {
      const errorText = await checkResponse.text();
      console.error('API Error:', errorText);
      return;
    }
    
    const result = await checkResponse.json();

    console.log('\n--- FEASIBILITY RESULT ---');
    console.log('Feasible:', result.feasible);
    console.log('Summary:', result.summary);
    if (result.issues?.length) {
      console.log('Issues:', JSON.stringify(result.issues, null, 2));
    }
    if (result.warnings?.length) {
      console.log('Warnings:', JSON.stringify(result.warnings, null, 2));
    }
    if (result.suggestions?.length) {
      console.log('Suggestions:', JSON.stringify(result.suggestions, null, 2));
    }
    console.log('--------------------------\n');
  } catch (err) {
    console.error('Test Failed:', err.message);
  }
}

testFeasibility();
