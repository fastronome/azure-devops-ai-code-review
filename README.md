# Fastronome AI Code Review DevOps Extension

[![Azure DevOps Marketplace](https://img.shields.io/badge/Azure%20DevOps-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=Fastronome.fastronome-ai-code-review)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.txt)

## Supercharge Your Code Reviews with the OpenAI API

Use your own OpenAI API key to provide pull request code reviews while keeping your code private.

This repository is an MIT-licensed fork published and maintained by **Fastronome**.
Current maintainer: **Alexey Samoylov**.
Original project lineage is preserved and attributed in the license section below.

- **AI Powered Insights:** Optimized for latest LLM models like GPT-4o-mini, which provides optimal high performance with small cost.
- **Security and Privacy:** Use your own OpenAI API key for reviews
- **Automated Summaries:** Let AI summarise your pull request so it's easier for humans to follow. AI will also provide feedback for all changes related to bugs, performance, best practices etc.
- **Easy to install:** A simple one-click installation from the [Azure DevOps Marketplace](https://marketplace.visualstudio.com/items?itemName=Fastronome.fastronome-ai-code-review) gets you up and running instantly. Configure to your pipeline as shown below.
- **Faster Reviews:** Reduce the time spent on code reviews. Let Open AI handle the routine, allowing your team to focus on impactful work.
- **Configurable and Customizable:** Tailor the extension to your needs with customizable settings. Specify the Open AI model, define file exclusions, and more.

## Sample review

Click for larger version:

[![sample review](screenshots/review1-thumbnail.jpg)](screenshots/review1.jpg)

## What does it cost?

The extension itself is free. The reviews will utilize your own OpenAI API account, so cost depends on the model you choose. As of today October 2024 the GPT-4o-mini seems to be optimal for this purpose and is cheap to use - today price for input prompt was $0.15 per 1M tokens, output was $0.60 per 1M tokens. While completing many pull requests the price per code review ranges from ~$0.0002 to ~$0.002 per review, so even 1000 PRs per month is still inexpensive.

You can set the token pricing on the task parameters and then you can see from your logs how much each of the reviews cost:

![](images/cost-analysis.jpg)

## Prerequisites

- [Azure DevOps Account](https://dev.azure.com/)
- OpenAI API key
- Optional: Pricing for input and output tokens (check from [OpenAI API pricing](https://openai.com/api/pricing/))

## Getting started

1. Install the AI Code Review DevOps Extension from the Azure DevOps Marketplace.
2. Add Open AI Code Review Task to Your Pipeline:

  ```yaml
  trigger:
    branches:
      exclude:
        - '*'

  pr:
    branches:
      include:
        - '*'

  jobs:
  - job: CodeReview
    pool:
      vmImage: 'ubuntu-latest'
    steps:
    - task: AICodeReview@1
      inputs:
        apiKey: $(OpenAIApiKey)
        # Optional: override for OpenAI-compatible gateways/providers
        # apiBaseUrl: "https://api.openai.com/v1"
        aiModel: "gpt-4o-mini"
        promptTokensPricePerMillionTokens: "0.15"
        completionTokensPricePerMillionTokens: "0.6"
        addCostToComments: true
        reviewBugs: true
        reviewPerformance: true
        reviewBestPractices: true
        reviewWholeDiffAtOnce: true
        maxTokens: 16384
        fileExtensions: '.js,.ts,**/*.sql,*.md'
        fileExcludes: '**/*.gen.go,**/*.pb.go,secret.txt'
        additionalPrompts: |
          Fix variable naming, Ensure consistent indentation, Review error handling approach, Check for OWASP best practices
  ```

Notes:
- `apiBaseUrl` is optional. Use it only when you need a custom OpenAI-compatible endpoint (proxy, gateway, or provider-specific base URL). Leave it unset for the default OpenAI API.
- `fileExtensions` accepts a comma-separated mix of extensions (for example `.ts`, `.go`) and glob patterns (for example `**/*.sql`, `*.md`)
- `fileExcludes` accepts a comma-separated mix of exact filenames and glob patterns (for example `secret.txt`, `**/*.gen.go`, `**/vendor/**`)

3. If you do not already have Build Validation configured for your branch already add [Build validation](https://learn.microsoft.com/en-us/azure/devops/repos/git/branch-policies?view=azure-devops&tabs=browser#build-validation) to your branch policy to trigger the code review when a Pull Request is created

## Input Reference

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `apiKey` | Yes | - | OpenAI API key used to generate reviews |
| `apiBaseUrl` | No | OpenAI default endpoint | Optional base URL override for OpenAI-compatible providers/gateways |
| `aiModel` | Yes | `gpt-4o-mini` | OpenAI model name used for review generation |
| `reviewBugs` | No | `true` | Include bug-focused checks in the review |
| `reviewPerformance` | No | `true` | Include performance-focused checks in the review |
| `reviewBestPractices` | No | `true` | Include best-practice checks in the review |
| `fileExtensions` | No | - | Comma-separated file extensions and/or glob patterns to include |
| `fileExcludes` | No | - | Comma-separated filenames and/or glob patterns to exclude |
| `additionalPrompts` | No | - | Extra review instructions appended to the main prompt |
| `promptTokensPricePerMillionTokens` | No | `0` | Input token price per million (used for cost reporting) |
| `completionTokensPricePerMillionTokens` | No | `0` | Output token price per million (used for cost reporting) |
| `reviewWholeDiffAtOnce` | No | `false` | Review the full PR diff in one pass instead of per-file |
| `maxTokens` | No | `16384` | Maximum tokens for each review request |
| `addCostToComments` | No | `false` | Append estimated review cost to posted comments |

## FAQ

### Q: What agent job settings are required?

A: Ensure that "Allow scripts to access OAuth token" is enabled as part of the agent job. Follow the [documentation](https://learn.microsoft.com/en-us/azure/devops/pipelines/build/options?view=azure-devops#allow-scripts-to-access-the-oauth-token) for more details.

### Q: What permissions are required for Build Administrators?

A: Build Administrators must be given "Contribute to pull requests" access. Check [this Stack Overflow answer](https://stackoverflow.com/a/57985733) for guidance on setting up permissions.

### Bug Reports

If you find a bug or unexpected behavior, please [open a bug report](https://github.com/fastronome/azure-devops-ai-code-review/issues/new?assignees=&labels=bug&template=bug_report.md&title=).

### Feature Requests

If you have ideas for new features or enhancements, please [submit a feature request](https://github.com/fastronome/azure-devops-ai-code-review/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=).

## License

This project is licensed under the [MIT License](LICENSE.txt).

Fastronome publishes and maintains this fork under the same MIT license terms.
Please retain existing copyright and license notices when redistributing.

If you would like to contribute to the development of this extension, please follow our contribution guidelines.

This repository is based on the work of [Tommi Laukkanen's fork](https://github.com/tlaukkanen/azure-devops-ai-code-review),
which was originally forked from [a1dancole/OpenAI-Code-Review](https://github.com/a1dancole/OpenAI-Code-Review).
