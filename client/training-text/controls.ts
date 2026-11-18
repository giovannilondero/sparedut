/**
 * Each control a training step names, as each device shows it (markup, read after "with" in an
 * instruction): a key or mouse button, a controller's button, the on-screen control by the label
 * it shows. A device has an entry only for the controls `CONTROL_DEVICES` gives it, so a control
 * a device gains or loses does not compile until this table follows. The Friulian is provisional.
 */
import type { DevicesWith } from "../../shared/training/controls.ts"
import type { ControlId } from "../../shared/training/station.ts"
import type { Lang } from "../i18n.ts"

export type ControlTexts = { readonly [C in ControlId]: { readonly [D in DevicesWith<C>]: string } }

/** The touch "use" button's labels, mounting and dismounting (as `Strings.hud.touchUse`/`touchLeave`). */
const TOUCH_USE = { fur: { use: "Mitraie", leave: "Lasse" }, it: { use: "Mitragliatrice", leave: "Lascia" } } as const

/** The controller buttons, named as the help's DualShock line names them: the same in both languages. */
const PAD = {
  jump: "<kbd>✕</kbd>",
  crouch: "<kbd>◯</kbd>",
  sprint: "<kbd>L3</kbd>",
  fire: "<kbd>R2</kbd>",
  aim: "<kbd>L2</kbd>",
  reload: "<kbd>▢</kbd>",
  cycle: "<kbd>△</kbd>",
  armoury: "<kbd>Touchpad</kbd>",
  bomb: "<kbd>L1</kbd>",
  mine: "<kbd>R1</kbd>",
  use: "<kbd>⬇</kbd>",
  board: "<kbd>Share</kbd>"
} as const

/** The touch buttons, by the glyph each shows on screen (`index.html`'s `#touch`). */
const TOUCH = {
  jump: "<kbd>▲</kbd>",
  crouch: "<kbd>▼</kbd>",
  fire: "<kbd>◉</kbd>",
  aim: "<kbd>◎</kbd>",
  reload: "<kbd>↻</kbd>",
  bomb: "<kbd>🍶</kbd>",
  mine: "<kbd>💣</kbd>",
  board: "<kbd>🏆</kbd>",
  phrases: "<kbd>💬</kbd>"
} as const

export const CONTROL_TEXT: { readonly [L in Lang]: ControlTexts } = {
  fur: {
    look: { keyboard: "<kbd>Mouse</kbd>", pad: "<kbd>Stick dret</kbd>", touch: "il <kbd>dêt sul schermi</kbd>" },
    move: { keyboard: "<kbd>WASD</kbd>", pad: "<kbd>Stick çamp</kbd>", touch: "il <kbd>Stick</kbd>" },
    jump: { keyboard: "<kbd>Spazi</kbd>", pad: PAD.jump, touch: TOUCH.jump },
    crouch: { keyboard: "<kbd>Ctrl</kbd>/<kbd>C</kbd>", pad: PAD.crouch, touch: TOUCH.crouch },
    sprint: { keyboard: "<kbd>Shift</kbd>", pad: PAD.sprint, touch: "il <kbd>Stick</kbd> dut indenant" },
    fire: { keyboard: "<kbd>Mouse çampe</kbd>", pad: PAD.fire, touch: TOUCH.fire },
    aim: { keyboard: "<kbd>Mouse drete</kbd>", pad: PAD.aim, touch: TOUCH.aim },
    reload: { keyboard: "<kbd>R</kbd>", pad: PAD.reload, touch: TOUCH.reload },
    slot: { keyboard: "<kbd>1-4</kbd>", pad: "la <kbd>crôs</kbd>", touch: "une pression lungje sul <kbd>non de arme</kbd>" },
    lastWeapon: { keyboard: "<kbd>Q</kbd>" },
    cycle: { keyboard: "<kbd>Rodele dal mouse</kbd>", pad: PAD.cycle, touch: "un tocjut sul <kbd>non de arme</kbd>" },
    armoury: { keyboard: "<kbd>B</kbd>", pad: PAD.armoury, touch: "<kbd>☰</kbd> › <kbd>Armarie</kbd>" },
    bomb: { keyboard: "<kbd>G</kbd>", pad: PAD.bomb, touch: TOUCH.bomb },
    mine: { keyboard: "<kbd>F</kbd>", pad: PAD.mine, touch: TOUCH.mine },
    use: { keyboard: "<kbd>E</kbd>", pad: PAD.use, touch: `<kbd>${TOUCH_USE.fur.use}</kbd>/<kbd>${TOUCH_USE.fur.leave}</kbd>` },
    board: { keyboard: "<kbd>Tab</kbd>", pad: PAD.board, touch: TOUCH.board },
    phrases: { keyboard: "<kbd>V</kbd>", touch: TOUCH.phrases },
    chat: { keyboard: "<kbd>Enter</kbd> o <kbd>T</kbd>" }
  },
  it: {
    look: { keyboard: "<kbd>Mouse</kbd>", pad: "<kbd>Stick destro</kbd>", touch: "il <kbd>dito sullo schermo</kbd>" },
    move: { keyboard: "<kbd>WASD</kbd>", pad: "<kbd>Stick sinistro</kbd>", touch: "lo <kbd>Stick</kbd>" },
    jump: { keyboard: "<kbd>Spazio</kbd>", pad: PAD.jump, touch: TOUCH.jump },
    crouch: { keyboard: "<kbd>Ctrl</kbd>/<kbd>C</kbd>", pad: PAD.crouch, touch: TOUCH.crouch },
    sprint: { keyboard: "<kbd>Shift</kbd>", pad: PAD.sprint, touch: "lo <kbd>Stick</kbd> tutto in avanti" },
    fire: { keyboard: "<kbd>Mouse Sx</kbd>", pad: PAD.fire, touch: TOUCH.fire },
    aim: { keyboard: "<kbd>Mouse Dx</kbd>", pad: PAD.aim, touch: TOUCH.aim },
    reload: { keyboard: "<kbd>R</kbd>", pad: PAD.reload, touch: TOUCH.reload },
    slot: { keyboard: "<kbd>1-4</kbd>", pad: "la <kbd>croce direzionale</kbd>", touch: "una pressione lunga sul <kbd>nome dell'arma</kbd>" },
    lastWeapon: { keyboard: "<kbd>Q</kbd>" },
    cycle: { keyboard: "<kbd>Rotellina</kbd>", pad: PAD.cycle, touch: "un tocco sul <kbd>nome dell'arma</kbd>" },
    armoury: { keyboard: "<kbd>B</kbd>", pad: PAD.armoury, touch: "<kbd>☰</kbd> › <kbd>Armeria</kbd>" },
    bomb: { keyboard: "<kbd>G</kbd>", pad: PAD.bomb, touch: TOUCH.bomb },
    mine: { keyboard: "<kbd>F</kbd>", pad: PAD.mine, touch: TOUCH.mine },
    use: { keyboard: "<kbd>E</kbd>", pad: PAD.use, touch: `<kbd>${TOUCH_USE.it.use}</kbd>/<kbd>${TOUCH_USE.it.leave}</kbd>` },
    board: { keyboard: "<kbd>Tab</kbd>", pad: PAD.board, touch: TOUCH.board },
    phrases: { keyboard: "<kbd>V</kbd>", touch: TOUCH.phrases },
    chat: { keyboard: "<kbd>Invio</kbd> o <kbd>T</kbd>" }
  }
}
