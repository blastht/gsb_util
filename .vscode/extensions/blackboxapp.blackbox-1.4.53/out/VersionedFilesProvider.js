const vscode = require('vscode');

class VersionedFilesProvider {
    constructor(versionControl) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.versionControl = versionControl;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    calculateDiffStats(versionElement) {
        const versions = this.versionControl.getAllVersions(versionElement.fileUri);
        const currentVersionIndex = versionElement.index;
    
        // If this is the first version, return null
        if (currentVersionIndex === versions.length - 1) {
            return null;
        }
    
        const currentContent = versions[currentVersionIndex];
        const previousContent = versions[currentVersionIndex + 1];
    
        const currentLines = currentContent.split('\n');
        const previousLines = previousContent.split('\n');
    
        let added = 0;
        let removed = 0;
    
        // Create arrays to track line status
        let i = 0, j = 0;
        
        while (i < currentLines.length || j < previousLines.length) {
            if (i >= currentLines.length) {
                // Remaining lines in previous version are deletions
                removed += previousLines.length - j;
                break;
            }
            if (j >= previousLines.length) {
                // Remaining lines in current version are additions
                added += currentLines.length - i;
                break;
            }
    
            if (currentLines[i] === previousLines[j]) {
                // Lines are identical
                i++;
                j++;
            } else {
                // Try to find the next matching line
                let foundMatch = false;
                
                // Look ahead in current version
                for (let lookAhead = i + 1; lookAhead < Math.min(i + 5, currentLines.length); lookAhead++) {
                    if (currentLines[lookAhead] === previousLines[j]) {
                        // Found match: lines between i and lookAhead are additions
                        added += lookAhead - i;
                        i = lookAhead;
                        foundMatch = true;
                        break;
                    }
                }
    
                if (!foundMatch) {
                    // Look ahead in previous version
                    for (let lookAhead = j + 1; lookAhead < Math.min(j + 5, previousLines.length); lookAhead++) {
                        if (previousLines[lookAhead] === currentLines[i]) {
                            // Found match: lines between j and lookAhead are deletions
                            removed += lookAhead - j;
                            j = lookAhead;
                            foundMatch = true;
                            break;
                        }
                    }
                }
    
                if (!foundMatch) {
                    // No match found within lookahead: count as both addition and deletion
                    added++;
                    removed++;
                    i++;
                    j++;
                }
            }
        }
    
        return { added, removed };
    }

    getTreeItem(element) {
        if (element.type === 'dateGroup') {
            const treeItem = new vscode.TreeItem(
                element.label,
                vscode.TreeItemCollapsibleState.Collapsed
            );
            treeItem.contextValue = 'dateGroup';
            treeItem.iconPath = new vscode.ThemeIcon('calendar');
            treeItem.description = `${element.files.length} file${element.files.length === 1 ? '' : 's'}`;
            return treeItem;
        }

        if (element.type === 'button') {
            const button = new vscode.TreeItem('Open Chat', vscode.TreeItemCollapsibleState.None);
            button.command = { command: 'extension.openChat', title: 'Open Chat' };
            button.iconPath = new vscode.ThemeIcon('comment');
            button.contextValue = 'chatButton';
            return button;
        }   
        // In the getTreeItem method, replace the existing command configuration:
        if (element.type === 'version') {
            const treeItem = new vscode.TreeItem('', vscode.TreeItemCollapsibleState.None);

            const versions = this.versionControl.getAllVersions(element.fileUri);
            const correctVersionNumber = versions.length - element.index;

            treeItem.label = `Version ${correctVersionNumber} - ${element.timestamp}`;

            if (element.index === 0) {
                treeItem.description = 'Initial version';
            } else {
                const diffStats = this.calculateDiffStats(element);
                if (diffStats) {
                    treeItem.description = `+${diffStats.added} -${diffStats.removed}`;
                }
            }

            treeItem.iconPath = new vscode.ThemeIcon('versions');
            treeItem.contextValue = 'version';

            // Update the command to use viewVersionDiff instead of restoreVersion
            treeItem.command = {
                command: 'extension.viewVersionDiff',
                title: 'View Version Diff',
                arguments: [element] // Pass the entire version element
            };

            return treeItem;
        }
    
        // If it's a file item
        const uri = vscode.Uri.parse(element);
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        const relativePath = vscode.workspace.asRelativePath(uri);
        const languageId = document ? document.languageId : 'plaintext';
    
        const treeItem = new vscode.TreeItem(
            relativePath,
            vscode.TreeItemCollapsibleState.Collapsed
        );
        
        treeItem.description = this.getLanguageLabel(languageId);
        
        return treeItem;
    }

    async getChildren(element) {
        if (!element) {
            // Root level - return date groups
            const allFiles = this.versionControl.getAllVersionedFiles();
            const now = new Date();

            // Create date groups
            const groups = {
                'Today': [],
                'Yesterday': [],
                'Last 7 Days': [],
                'Last 30 Days': [],
                'More': []
            };

            // Helper function to get the last modified time of a file
            const getLastModifiedTime = (fileUri) => {
                const versions = this.versionControl.getAllVersions(fileUri);
                if (versions && versions.length > 0) {
                    return new Date(this.versionControl.getVersionTimestamp(fileUri, 0));
                }
                return new Date(0);
            };

            // Sort files into groups
            allFiles.forEach(fileUri => {
                const lastModified = getLastModifiedTime(fileUri);

                // Reset the time to midnight for both dates
                const lastModifiedDate = new Date(lastModified.getFullYear(), lastModified.getMonth(), lastModified.getDate());
                const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

                // Calculate the difference in days
                const diffDays = Math.floor((nowDate - lastModifiedDate) / (1000 * 60 * 60 * 24));

                if (diffDays === 0) {
                    groups['Today'].push({ type: 'file', uri: fileUri });
                } else if (diffDays === 1) {
                    groups['Yesterday'].push({ type: 'file', uri: fileUri });
                } else if (diffDays <= 7) {
                    groups['Last 7 Days'].push({ type: 'file', uri: fileUri });
                } else if (diffDays <= 30) {
                    groups['Last 30 Days'].push({ type: 'file', uri: fileUri });
                } else {
                    groups['More'].push({ type: 'file', uri: fileUri });
                }
            });

            // Create tree items for groups (only show non-empty groups)
            return [
                { type: 'button' },
                ...Object.entries(groups)
                    .filter(([_, files]) => files.length > 0)
                    .map(([groupName, files]) => ({
                        type: 'dateGroup',
                        label: groupName,
                        files: files
                    }))
            ];
        }

        if (element.type === 'dateGroup') {
            // Return files in the date group
            return element.files.map(file => file.uri);
        }

        // If element is a file URI, return versions
        const versions = this.versionControl.getAllVersions(element);
        if (versions) {
            return versions.map((content, index) => ({
                type: 'version',
                fileUri: element,
                versionNumber: versions.length - index,
                content: content,
                timestamp: this.versionControl.getVersionTimestamp(element, index),
                index: index
            })).reverse();
        }

        return [];
    }

    getLanguageLabel(languageId) {
        // Map language IDs to their display labels
        const labelMap = {
            javascript: 'JS',
            typescript: 'TS',
            python: 'PY',
            java: 'JAVA',
            html: 'HTML',
            css: 'CSS',
            json: 'JSON',
            markdown: 'MD',
            plaintext: 'TXT'
        };
        
        return labelMap[languageId] || 'TXT';
    }
}

module.exports = VersionedFilesProvider;