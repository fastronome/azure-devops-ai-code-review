import tl = require('azure-pipelines-task-lib/task');
import OpenAI from 'openai';
import { ChatCompletion } from './chatCompletion';
import { Repository } from './repository';
import { PullRequest, PullRequestThreadStatus } from './pullrequest';

export class Main {
    private static _chatCompletion: ChatCompletion;
    private static _repository: Repository;
    private static _pullRequest: PullRequest;

    public static async Main(): Promise<void> {
        if (tl.getVariable('Build.Reason') !== 'PullRequest') {
            tl.setResult(tl.TaskResult.Skipped, "This task must only be used when triggered by a Pull Request.");
            return;
        }

        if(!tl.getVariable('System.AccessToken')) {
            tl.setResult(tl.TaskResult.Failed, "'Allow Scripts to Access OAuth Token' must be enabled. See https://learn.microsoft.com/en-us/azure/devops/pipelines/build/options?view=azure-devops#allow-scripts-to-access-the-oauth-token for more information");
            return;
        }

        const apiKey = tl.getInput('apiKey', true)!;
        const apiBaseUrl = tl.getInput('apiBaseUrl', false)?.trim();
        const aiModel = tl.getInput('aiModel', true)!;
        const fileExtensions = tl.getInput('fileExtensions', false);
        const filesToExclude = tl.getInput('fileExcludes', false);
        const additionalPrompts = tl.getInput('additionalPrompts', false)?.split(',')
        const promptTokensPricePerMillionTokens = parseFloat(tl.getInput('promptTokensPricePerMillionTokens', false) ?? '0.');
        const completionTokensPricePerMillionTokens = parseFloat(tl.getInput('completionTokensPricePerMillionTokens', false) ?? '0.');
        const maxTokens = parseInt(tl.getInput('maxTokens', false) ?? '16384');
        const reviewWholeDiffAtOnce = tl.getBoolInput('reviewWholeDiffAtOnce', false);
        const addCostToComments = tl.getBoolInput('addCostToComments', false);

        const client = new OpenAI({
            apiKey,
            ...(apiBaseUrl ? { baseURL: apiBaseUrl } : {})
        });
        
        this._repository = new Repository();
        this._pullRequest = new PullRequest();
        let filesToReview = await this._repository.GetChangedFiles(fileExtensions, filesToExclude);

        this._chatCompletion = new ChatCompletion(
            client,
            tl.getBoolInput('reviewBugs', true),
            tl.getBoolInput('reviewPerformance', true),
            tl.getBoolInput('reviewBestPractices', true),
            additionalPrompts,
            aiModel,
            maxTokens,
            filesToReview.length,
            reviewWholeDiffAtOnce
        );

        await this._pullRequest.DeleteComments();

        tl.setProgress(0, 'Performing Code Review');
        let promptTokensTotal = 0;
        let completionTokensTotal = 0;
        let fullDiff = '';
        for (let index = 0; index < filesToReview.length; index++) {
            const fileToReview = filesToReview[index];
            let diff = await this._repository.GetDiff(fileToReview);
            if(!reviewWholeDiffAtOnce) {
                let review = await this._chatCompletion.PerformCodeReview(diff, fileToReview);
                promptTokensTotal += review.promptTokens;
                completionTokensTotal += review.completionTokens;

                if(review.response.indexOf('NO_COMMENT') < 0) {
                    console.info(`Completed review of file ${fileToReview}`)
                    const threadStatus = this.GetThreadStatus(review.response, false);
                    await this._pullRequest.AddComment(fileToReview, review.response, threadStatus);
                } else {
                    console.info(`No comments for file ${fileToReview}`)
                }

                tl.setProgress((fileToReview.length / 100) * index, 'Performing Code Review');
            } else {
                fullDiff += diff;
            }
        }
        if(reviewWholeDiffAtOnce) {
            let review = await this._chatCompletion.PerformCodeReview(fullDiff, 'Full Diff');
            promptTokensTotal += review.promptTokens;
            completionTokensTotal += review.completionTokens;

            let comment = review.response;
            if(addCostToComments) {
                const promptTokensCost = promptTokensTotal * (promptTokensPricePerMillionTokens / 1000000);
                const completionTokensCost = completionTokensTotal * (completionTokensPricePerMillionTokens / 1000000);
                const totalCostString = (promptTokensCost + completionTokensCost).toFixed(6);
                comment += `\n\n💰 _It cost $${totalCostString} to create this review_`;
            }

            if(review.response.indexOf('NO_COMMENT') < 0) {
                console.info(`Completed review for ${filesToReview.length} files`)
                const threadStatus = this.GetThreadStatus(review.response, true);
                await this._pullRequest.AddComment("", comment, threadStatus);
            } else {
                console.info(`No comments for full diff`)
            }
        }

        if(promptTokensPricePerMillionTokens !== 0 || completionTokensPricePerMillionTokens !== 0) {
            const promptTokensCost = promptTokensTotal * (promptTokensPricePerMillionTokens / 1000000);
            const completionTokensCost = completionTokensTotal * (completionTokensPricePerMillionTokens / 1000000);
            const totalCostString = (promptTokensCost + completionTokensCost).toFixed(6);
            console.info(`--- Cost Analysis ---`);
            console.info(`🪙 Total Prompt Tokens     : ${promptTokensTotal}`);
            console.info(`🪙 Total Completion Tokens : ${completionTokensTotal}`); 
            console.info(`💵 Input Tokens Cost       : ${promptTokensCost.toFixed(6)} $`);
            console.info(`💵 Output Tokens Cost      : ${completionTokensCost.toFixed(6)} $`);
            console.info(`💰 Total Cost              : ${totalCostString} $`);
        }
        tl.setResult(tl.TaskResult.Succeeded, "Pull Request reviewed.");
    }

    private static GetThreadStatus(reviewResponse: string, reviewWholeDiffAtOnce: boolean): PullRequestThreadStatus {
        if (reviewWholeDiffAtOnce) {
            return this.GetWholeDiffThreadStatus(reviewResponse);
        }

        return this.GetPerFileThreadStatus(reviewResponse);
    }

    private static GetPerFileThreadStatus(reviewResponse: string): PullRequestThreadStatus {
        const statusMatch = reviewResponse.match(/^\s*(?:\*\*)?status(?:\*\*)?\s*:?\s*(✅\s*passed|❓\s*questions|❌\s*not\s*passed)\s*$/im);
        if (!statusMatch) {
            return 'active';
        }

        return this.ParseStatusCell(statusMatch[1]) === 'passed' ? 'resolved' : 'active';
    }

    private static GetWholeDiffThreadStatus(reviewResponse: string): PullRequestThreadStatus {
        const lines = reviewResponse.split(/\r?\n/);
        let statusColumnIndex = -1;
        let inStatusTable = false;
        let sawRecognizedStatus = false;

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('|')) {
                if (inStatusTable) {
                    break;
                }
                continue;
            }

            const cells = this.ParseMarkdownTableRow(line);
            if (cells.length === 0) {
                continue;
            }

            if (!inStatusTable) {
                const normalizedHeaderCells = cells.map(cell => cell.trim().toLowerCase());
                const hasFileName = normalizedHeaderCells.includes('file name');
                const hasStatus = normalizedHeaderCells.includes('status');
                const hasComments = normalizedHeaderCells.includes('comments');

                if (hasFileName && hasStatus && hasComments) {
                    statusColumnIndex = normalizedHeaderCells.indexOf('status');
                    inStatusTable = true;
                }
                continue;
            }

            if (this.IsMarkdownSeparatorRow(cells)) {
                continue;
            }

            if (statusColumnIndex < 0 || statusColumnIndex >= cells.length) {
                return 'active';
            }

            const status = this.ParseStatusCell(cells[statusColumnIndex]);
            if (status === 'unknown') {
                return 'active';
            }

            sawRecognizedStatus = true;

            if (status !== 'passed') {
                return 'active';
            }
        }

        return sawRecognizedStatus ? 'resolved' : 'active';
    }

    private static ParseMarkdownTableRow(line: string): string[] {
        return line
            .split('|')
            .map(cell => cell.trim())
            .filter((_, index, arr) => !(index === 0 && arr[index] === '') && !(index === arr.length - 1 && arr[index] === ''));
    }

    private static IsMarkdownSeparatorRow(cells: string[]): boolean {
        return cells.every(cell => /^:?-{3,}:?$/.test(cell.trim()));
    }

    private static ParseStatusCell(statusCell: string): 'passed' | 'questions' | 'not_passed' | 'unknown' {
        const normalized = statusCell
            .replace(/\*\*/g, '')
            .trim()
            .toLowerCase();

        if (normalized.includes('not passed')) {
            return 'not_passed';
        }

        if (normalized.includes('questions')) {
            return 'questions';
        }

        if (normalized.includes('passed')) {
            return 'passed';
        }

        return 'unknown';
    }
}

Main.Main();
