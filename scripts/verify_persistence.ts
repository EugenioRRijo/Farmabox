
import axios from 'axios';

const API_URL = 'http://localhost:3001/api/schedule-blocks';

async function verifyPersistence() {
  console.log('1. Saving mixed semester blocks...');
  
  const blocks = [
    {
      id: 'block-sem1',
      subjectCode: '3307011103', // MATEMATICAS I (Sem 1)
      day: 0,
      startHour: 7,
      duration: 2,
      type: 'THEORY'
    },
    {
      id: 'block-sem2',
      subjectCode: '3307011108', // MATEMATICAS II (Sem 2)
      day: 0,
      startHour: 8,
      duration: 2, // Overlaps 8-9 with block-sem1
      type: 'THEORY'
    }
  ];

  try {
    await axios.put(API_URL, blocks);
    console.log('   ✅ Save successful');

    console.log('2. Fetching blocks back from API...');
    const response = await axios.get(API_URL);
    const fetchedBlocks = response.data;

    console.log(`   Fetched ${fetchedBlocks.length} blocks.`);

    const hasSem1 = fetchedBlocks.some((b: any) => b.id === 'block-sem1');
    const hasSem2 = fetchedBlocks.some((b: any) => b.id === 'block-sem2');

    if (hasSem1 && hasSem2) {
      console.log('   ✅ Both Semester 1 and Semester 2 blocks are present.');
      console.log('   ✅ Persistence Logic Verified: The system holds data for all semesters provided.');
    } else {
      console.error('   ❌ FAILED: Missing blocks.');
      console.log('fetched:', fetchedBlocks);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

verifyPersistence();
