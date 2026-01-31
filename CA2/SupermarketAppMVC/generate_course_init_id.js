// Generator adapted from NETSDemo — creates `course_init_id.js` if missing
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

async function generateCourseInitId() {
  const courseInitIdFilePath = path.join(__dirname, 'course_init_id.js');
  if (fs.existsSync(courseInitIdFilePath)) {
    console.log('Course ID file already exists. Skipping creation.');
    return;
  }
  const courseInitId = uuidv4();
  const fileContent = `// Course init id used by NETS demo integrations\nmodule.exports = { courseInitId: '${courseInitId}' };\n`;
  try {
    fs.writeFileSync(courseInitIdFilePath, fileContent, { mode: 0o444 });
    console.log(`Course ID file created: ${courseInitId}`);
  } catch (err) {
    console.error('Failed to create course_init_id.js:', err.message);
  }
}

if (require.main === module) {
  generateCourseInitId();
}
