import * as tl from "azure-pipelines-task-lib/task";
import { SimpleGit, SimpleGitOptions, simpleGit } from "simple-git";
import binaryExtensions from "./binaryExtensions";

export class Repository {

    private gitOptions: Partial<SimpleGitOptions> = {
        baseDir: `${tl.getVariable('System.DefaultWorkingDirectory')}`,
        binary: 'git'
    };

    private readonly _repository: SimpleGit;

    constructor() {
        this._repository = simpleGit(this.gitOptions);
        this._repository.addConfig('core.pager', 'cat');
        this._repository.addConfig('core.quotepath', 'false');
    }

    public async GetChangedFiles(fileExtensions: string | undefined, filesToExclude: string | undefined): Promise<string[]> {
        await this._repository.fetch();

        let targetBranch = this.GetTargetBranch();

        let diffs = await this._repository.diff([targetBranch, '--name-only', '--diff-filter=AM']);
        let files = diffs.split('\n').filter(line => line.trim().length > 0);
        let filesToReview = files.filter(file => !binaryExtensions.includes(file.slice((file.lastIndexOf(".") - 1 >>> 0) + 2)));

        if(fileExtensions) {
            const includePatterns = fileExtensions
                .split(',')
                .map(pattern => pattern.trim())
                .filter(pattern => pattern.length > 0);
            console.log(`Include patterns/extensions specified: ${includePatterns.join(', ')}`);
            filesToReview = filesToReview.filter(file => this.matchesPattern(file, includePatterns));
        } else {
            console.log('No file extensions specified. All files will be reviewed.');
        }

        if(filesToExclude) {
            const excludePatterns = filesToExclude
                .split(',')
                .map(pattern => pattern.trim())
                .filter(pattern => pattern.length > 0);
            console.log(`Exclude patterns specified: ${excludePatterns.join(', ')}`);
            filesToReview = filesToReview.filter(file => !this.matchesPattern(file, excludePatterns));
        }

        return filesToReview;
    }

    public async GetDiff(fileName: string): Promise<string> {
        let targetBranch = this.GetTargetBranch();
        
        let diff = await this._repository.diff([targetBranch, '--', fileName]);

        return diff;
    }

    private GetTargetBranch(): string {
        let targetBranchName = tl.getVariable('System.PullRequest.TargetBranchName');

        if (!targetBranchName) {
            targetBranchName = tl.getVariable('System.PullRequest.TargetBranch')?.replace('refs/heads/', '');
        }

        if (!targetBranchName) {
            throw new Error(`Could not find target branch`)
        }

        return `origin/${targetBranchName}`;
    }

    private matchesPattern(filePath: string, patterns: string[]): boolean {
        const normalizedFilePath = filePath.replace(/\\/g, '/');
        const fileName = normalizedFilePath.split('/').pop() ?? normalizedFilePath;

        return patterns.some(pattern => {
            const normalizedPattern = pattern.replace(/\\/g, '/');

            if (this.globMatches(normalizedFilePath, normalizedPattern)) {
                return true;
            }

            if (this.isExtensionToken(normalizedPattern)) {
                return normalizedFilePath.endsWith(normalizedPattern);
            }

            // Backward compatibility: plain filenames (e.g. "secret.txt") match basenames.
            if (!normalizedPattern.includes('/')) {
                return this.globMatches(fileName, normalizedPattern);
            }

            return false;
        });
    }

    private isExtensionToken(pattern: string): boolean {
        return pattern.startsWith('.')
            && !pattern.includes('/')
            && !pattern.includes('*')
            && !pattern.includes('?');
    }

    private globMatches(value: string, pattern: string): boolean {
        return this.globToRegExp(pattern).test(value);
    }

    private globToRegExp(pattern: string): RegExp {
        let regex = '^';

        for (let i = 0; i < pattern.length; i++) {
            const ch = pattern[i];

            if (ch === '*') {
                const next = pattern[i + 1];
                const afterNext = pattern[i + 2];

                // Support **/ prefix for "any nested directories, including none".
                if (next === '*' && afterNext === '/') {
                    regex += '(?:.*/)?';
                    i += 2;
                    continue;
                }

                if (next === '*') {
                    regex += '.*';
                    i += 1;
                    continue;
                }

                regex += '[^/]*';
                continue;
            }

            if (ch === '?') {
                regex += '[^/]';
                continue;
            }

            if ('\\^$+?.()|{}[]'.includes(ch)) {
                regex += `\\${ch}`;
                continue;
            }

            regex += ch;
        }

        regex += '$';
        return new RegExp(regex);
    }
}
