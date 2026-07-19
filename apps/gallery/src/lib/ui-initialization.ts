import { configureUi, type ConfigureUiResult } from '@yesid/ui/cn';

export function initializeUi(): ConfigureUiResult {
	return configureUi({
		vocab: {
			text: ['operational-label'],
		},
	});
}
