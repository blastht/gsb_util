const vscode = require("vscode");
const path = require('path')

function calculateEndPosition(startPosition, text) {
  const lines = text.split("\n");
  const lineCount = lines.length - 1;

  if (lineCount === 0) {
    // Single line, just move the character position forward
    return startPosition.translate(0, text.length);
  } else {
    // Multiple lines, move to the end of the last line
    const lastLineLength = lines[lineCount].length;
    return new vscode.Position(startPosition.line + lineCount, lastLineLength);
  }
}

async function getFilesInCurrentDirectory() {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders){
      return null
    }
    const files = await Promise.all(workspaceFolders.map(async folder => {
      const filesInFolder = await vscode.workspace.findFiles({
        pattern: '**/*',
        folder
      });
      return filesInFolder.filter(resource => !resource.fsPath.includes('node_modules') && !resource.fsPath.includes('.next')).map(resource => resource.fsPath);
    }));
    return files.flat();
  } catch (error) {
    console.error(error);
    return [];
  }
}

const filePathDelimiter = '[FILE_PATH]: '
const fileContentStartDelimiter = '[FILE_CONTENT]: '
const fileContentEndDelimiter = '[END_FILE]'

async function getFilesContents(filePaths) {
  try {
    if (!filePaths){
      return null
    }
    const fileDetails = [];
    const promises = filePaths.map(async filePath => {
      try {
        const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        fileDetails.push(`${filePathDelimiter}${filePath}\n${fileContentStartDelimiter}${fileContent.toString()}\n${fileContentEndDelimiter}\n`);
      } catch (error) {
        console.error(`Error reading file ${filePath}: ${error.message}`);
      }
    });
    return Promise.all(promises).then(() => fileDetails.join(''));
  } catch (error) {
    console.error(error);
    return null
  }
}
module.exports = {
  getFilesContents,
  calculateEndPosition,
  getFilesInCurrentDirectory
};
