import {
  App,
  Editor,
  ListItemCache,
  MarkdownView,
  Modal,
  Plugin,
  PluginSettingTab,
  SearchComponent,
  Setting,
  TFile,
} from 'obsidian';

import { GenericTextSuggester } from './genericTextSuggester';
import { obliqueStrategies } from './obliqueStrategies';

const DEFAULT_SETTINGS: RandomPromptSettings = {
  notePath: undefined,
  promptPrefix: '',
  obliqueStrategies,
};

interface RandomPromptSettings {
  notePath?: string;
  promptPrefix: string;
  obliqueStrategies: string[];
}

// get random item from array
const sample = <T>(array: T[]): T | undefined =>
  array[(Math.random() * array.length) | 0];

export default class RandomPrompt extends Plugin {
  settings: RandomPromptSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'random-prompt-insert',
      name: 'Insert random prompt',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        new RandomPromptModal(this.app, editor, this.settings).open();
      },
    });

    // TODO: separate modal for strategies
    // this.addCommand({
    //   id: 'random-prompt-insert-strategy',
    //   name: 'Insert random strategy',
    //   editorCallback: (editor: Editor, view: MarkdownView) => {
    //     new RandomPromptModal(this.app, editor, this.settings).open();
    //   },
    // });

    this.addSettingTab(new RandomPromptSettingTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class RandomPromptModal extends Modal {
  editor: Editor;
  prompt?: string;
  shouldInsert: boolean;
  settings: RandomPromptSettings;
  keydownHandler: (e: KeyboardEvent) => void;

  constructor(app: App, editor: Editor, settings: RandomPromptSettings) {
    super(app);
    this.editor = editor;
    this.shouldInsert = false;
    this.settings = settings;
  }

  // TODO: golf this using reduce
  parsePrompts(text: string, listItems: ListItemCache[]): string[] {
    const lines = text.split('\n');
    const prompts: string[] = [];

    for (const listItem of listItems) {
      // TODO: make this work with multiline list items
      const pos = listItem.position.start.line;
      const item = lines[pos].trim().replace(/^- /, '');
      prompts.push(item);
    }

    return prompts;
  }

  onOpen() {
    this.shouldInsert = false;

    const { settings } = this;
    const { notePath } = settings;

    // TODO: make notePath optional if settings.useObliqueStrategies = true
    // if notePath exists and returns prompts (via await), cool
    // otherwise just use obliqueStrategies

    // TODO: error modal
    if (!notePath) {
      console.error('prompt note not set');
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(notePath);

    // TODO: error modal
    if (!(file instanceof TFile)) {
      console.error('file not found');
      return;
    }

    const metadata = this.app.metadataCache.getFileCache(file);
    this.app.vault.cachedRead(file).then((text) => {
      const prompts = this.parsePrompts(text, metadata?.listItems || []);

      // TODO: concat(obliqueStrategies) if settings.useObliqueStrategies = true
      const prompt = sample(prompts);

      if (!prompt) {
        console.error('no prompt found');
        return;
      }

      const prefix = settings.promptPrefix
        ? `${settings.promptPrefix.trimEnd()} `
        : '';

      this.prompt = `${prefix}${prompt}\n`;

      this.keydownHandler = (e: KeyboardEvent) => {
        e.preventDefault();

        if (e.key === 'Enter') {
          this.shouldInsert = true;
          this.close();
        }
      };

      this.modalEl.classList.add('random-prompt');
      this.titleEl.setText('Random Prompt');

      const promptEl = this.contentEl.createEl('h2', {
        text: prompt,
        cls: 'prompt-text',
      });

      this.contentEl.appendChild(promptEl);

      new Setting(this.contentEl).addButton((button) =>
        button
          .setButtonText('Insert ↩')
          .setCta()
          .onClick(() => {
            this.shouldInsert = true;
            this.close();
          })
      );

      window.addEventListener('keydown', this.keydownHandler);
    });
  }

  onClose() {
    const { contentEl, editor, keydownHandler, prompt, shouldInsert } = this;

    window.removeEventListener('keydown', keydownHandler);

    if (shouldInsert && prompt) {
      editor.replaceSelection(prompt);
    }

    contentEl.empty();
  }
}

class RandomPromptSettingTab extends PluginSettingTab {
  plugin: RandomPrompt;

  constructor(app: App, plugin: RandomPrompt) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.classList.add('random-prompt');
    containerEl.createEl('h2', { text: 'Random Prompt' });

    new Setting(containerEl)
      .setName('Prompt note')
      .setDesc('Note for prompts')
      .setClass('search')
      .addSearch(async (search: SearchComponent) => {
        const markdownFiles: string[] = this.app.vault
          .getMarkdownFiles()
          .map((f) => f.path);

        new GenericTextSuggester(this.app, search.inputEl, markdownFiles);

        search
          .setValue(this.plugin.settings.notePath || '')
          .setPlaceholder('Choose note')
          .onChange(async (value: string) => {
            this.plugin.settings.notePath = value;
          });
      });

    new Setting(containerEl)
      .setName('Prompt prefix')
      .setDesc('Prompt prefix string')
      .addText((text) =>
        text
          .setPlaceholder('Example: ##')
          .setValue(this.plugin.settings.promptPrefix)
          .onChange(async (value) => {
            this.plugin.settings.promptPrefix = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
