// Constants
const STORAGE_KEY = "COMP4537_lab1"; // where notes are stored as JSON
const TEXTAREA_PREFIX = "textarea";  // DOM id prefix for textareas
const NOTE_PREFIX = "note-";         // Prefix for note ids in LocalStorage
const AUTOSAVE_MS = 2000;            // save every 2 second


class NoteUtils {

    static nowTime() {
        return new Date().toLocaleTimeString();
    }
    /**
     * Persist notes array (of plain objects) to localStorage.
     * @param {Array<{id:string, content:string}>} notesArr
     */
    static saveNotesToStorage(notesArr) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notesArr));
    }

    /**
     * Load notes array from localStorage.
     * @returns {Array<{id:string, content:string}>}
     */
    static loadNotesFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    /**
     * Turn plain objects into Note instances and render them.
     * Returns a dictionary: id -> Note
     */
    static hydrateNotes(plainNotes, container, onRemove) {
        const dict = {};
        for (const n of plainNotes) {
            const note = new Note(n.id, n.content);
            note.render(container, onRemove);
            dict[n.id] = note;
        }
        return dict;
    }
}

class Writer {
    constructor(){
        // DOM elements
        this.addBtn = document.getElementById("addNote");
        this.container = document.getElementById("notesContainer");
        this.storedDate = document.getElementById("storedDate");
        this.backBtn = document.getElementById("back");

        // UI text
        this.addBtn.innerHTML = MESSAGES.add;
        this.backBtn.innerHTML = MESSAGES.back;

        // State
        this.notes = {};
        this.counter = 0;
        this.autosaveTimer = null;

        // Bind handlers (so "this" is correct inside handlers)
        this.handleAdd = this.handleAdd.bind(this);
        this.handleRemove = this.handleRemove.bind(this);
        this.autosave = this.autosave.bind(this);

        // Event listeners
        this.addBtn.addEventListener('click', this.handleAdd);
        // Save while typing
        this.container.addEventListener("input", this.autosave);
        // Also save when a textarea loses focus
        this.container.addEventListener("blur", this.autosave, true);
        
        // Load existing notes, render them, and set counter
        const existing = NoteUtils.loadNotesFromStorage(); // [{id, content}]
        this.notes = NoteUtils.hydrateNotes(existing, this.container, this.handleRemove);
        this.counter = this.findMaxCounter(existing);

        // Start autosave loop
        this.autosaveTimer = setInterval(this.autosave, AUTOSAVE_MS);
        this.autosave(); // show timestamp immediately
    }

    /**
     * Look at ids like "note-7" and find the max number to continue from.
     */
    findMaxCounter(plainNotes) {
        let maxNum = 0;
        for (const n of plainNotes) {
        const match = /^note-(\d+)$/.exec(n.id);
        if (match) {
            const num = parseInt(match[1], 10);
            if (!Number.isNaN(num)) maxNum = Math.max(maxNum, num);
        }
        }
        return maxNum;
    }

    /** Return ids like "note-1", "note-2", ... */
    generateId() {
        this.counter += 1;
        return "note-" + this.counter;
    }

    handleAdd() {
        const id = this.generateId();
        const note = new Note(id, "");
        note.render(this.container, this.handleRemove);
        this.notes[id] = note;
        this.autosave(); // reflect change right away
    }

    handleRemove(id) {
        const note = this.notes[id];
        if (!note) return;
        note.delete();        // remove from DOM
        delete this.notes[id];
        this.autosave();      // persist immediately
    }

    /** Save all notes to localStorage and update the "last saved" label. */
    autosave() {
        const arr = Object.values(this.notes).map(n => ({
        id: n.id,
        content: n.getContent(),
        }));

        NoteUtils.saveNotesToStorage(arr);

        if (this.storedDate) {
        const label = MESSAGES.storedAt;
        this.storedDate.textContent = label + " " + NoteUtils.nowTime();
        }
    }
}

class Reader {
  constructor() {
    // DOM
    this.updatedDate = document.getElementById("updatedDate");
    this.wrapper = document.getElementById("messageWrapper");
    this.backBtn = document.getElementById("back");

    // UI text
    this.backBtn.innerHTML = MESSAGES.back;

    // bind
    this.poll = this.poll.bind(this);
    this.renderFromRaw = this.renderFromRaw.bind(this);
    this.updateTimestamp = this.updateTimestamp.bind(this);

    // For small optimization: avoid re-rendering the same JSON
    this.prevRaw = null;

    // Update immediately on load
    this.poll();

    // Per-lab requirement: check every 2 seconds
    this.timer = setInterval(this.poll, AUTOSAVE_MS || 2000);

    // Bonus: instant cross-tab updates in the same browser
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) {
        this.renderFromRaw(e.newValue);
      }
    });
  }

  // Read the raw JSON from localStorage
  readRaw() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw || "[]";
  }

  // Render UI from a raw JSON string
  renderFromRaw(raw) {
    if (raw === this.prevRaw) {
      this.updateTimestamp();
      return;
    }
    this.prevRaw = raw;

    let notes = [];
    try {
      notes = JSON.parse(raw);
      if (!Array.isArray(notes)) notes = [];
    } catch {
      notes = [];
    }

    // Clear current DOM
    this.wrapper.innerHTML = "";

    // Render read-only textareas (simple and obvious)
    for (const n of notes) {
      const div = document.createElement("div");
      div.className = "note";

      const ta = document.createElement("textarea");
      ta.readOnly = true;
      ta.id = (typeof TEXTAREA_PREFIX !== "undefined" ? TEXTAREA_PREFIX : "textarea-") + (n.id || "");
      ta.value = n.content || "";

      div.appendChild(ta);
      this.wrapper.appendChild(div);
    }

    this.updateTimestamp();
  }

  updateTimestamp() {
    const label = MESSAGES.updatedAt;
    const timeStr =
      (typeof NoteUtils !== "undefined" && NoteUtils.nowTime)
        ? NoteUtils.nowTime()
        : new Date().toLocaleTimeString();

    if (this.updatedDate) {
      this.updatedDate.textContent = `${label} ${timeStr}`;
    }
  }

  // Called every 2 seconds
  poll() {
    this.renderFromRaw(this.readRaw());
  }
}


class Note {
    constructor(id, content = ""){
        this.id = id;this.content = content;

        this.wrapper = null;
        this.textarea = null;
        this.removeBtn = null;
        this.textarea = document.createElement('textarea');
        this.textarea.id = TEXTAREA_PREFIX + id;
    }

    /**
     * Build the DOM and attach it to the container.
     * @param {HTMLElement} container
     * @param {(id:string)=>void} onRemove
     */
    render(container, onRemove) {
        this.wrapper = document.createElement("div");
        this.wrapper.classList.add("note");

        this.textarea = document.createElement("textarea");
        this.textarea.id = TEXTAREA_PREFIX + this.id;
        this.textarea.value = this.content;

        const rb = new RemoveButton(this.id, onRemove);
        this.removeBtn = rb.button;

        this.wrapper.appendChild(this.textarea);
        this.wrapper.appendChild(this.removeBtn);
        container.appendChild(this.wrapper);
    }

    getContent() {
        return this.textarea ? this.textarea.value : this.content;
    }
    
    delete(){
        if (this.wrapper && this.wrapper.parentNode) {
            this.wrapper.parentNode.removeChild(this.wrapper);
        }
    }

}

class UI {
    constructor(){
        this.writerBtn = document.getElementById('writer');
        this.readerBtn = document.getElementById('reader');
        this.title = document.getElementById('Title');
        this.writerBtn.innerHTML = MESSAGES.writer;
        this.readerBtn.innerHTML = MESSAGES.reader;
        this.title.innerHTML = MESSAGES.title;
        this.writerBtn.addEventListener('click', this.goToWriter);
        this.readerBtn.addEventListener('click', this.goToReader);
    }

    goToWriter(){
        document.location.href = "writer.html";
        let writer = new Writer();
    }

    goToReader(){
        document.location.href = "reader.html";
        let reader = new Reader();
    }

}

/** Separate class for Remove button. */
class RemoveButton {
  constructor(noteId, onRemove) {
    this.noteId = noteId;
    this.onRemove = onRemove;

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.classList.add("btn", "btn-remove");

    const label = MESSAGES.remove;
    // icon + label (simple emoji keeps it dependency-free)
    this.button.innerHTML = `<span class="icon" aria-hidden="true">🗑️</span><span class="label">${label}</span>`;

    this.button.addEventListener("click", () => {
      this.onRemove(this.noteId);
    });
  }
}


if (document.location.href.includes("writer.html")){
    let writer = new Writer();
}
if (document.location.href.includes("index.html")) {
    let ui = new UI();
}
if (document.location.href.includes("reader.html")){
    let reader = new Reader();
}