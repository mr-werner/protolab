import { ArrangeTools } from "./fields.jsx";

// Settings shown when several parts are selected.
export default function MultiPanel({ count, grouped, unit, ops, onDuplicate, onDelete, onClose }) {
  return (
    <div className="b-insp">
      <div className="b-insp-head">
        <h3 className="b-insp-title">{count} parts selected</h3>
        <button className="b-x" onClick={onClose} aria-label="Clear selection">
          ×
        </button>
      </div>
      <div className="b-btnrow">
        {grouped ? (
          <button className="b-btn small" onClick={ops.ungroup}>
            Ungroup
          </button>
        ) : (
          <button className="b-btn small" onClick={ops.group} title="Group (Ctrl+G): click any part to select them all">
            Group
          </button>
        )}
        <button className="b-btn small ghost" onClick={() => ops.setHole(false)}>
          All solid
        </button>
        <button className="b-btn small ghost" onClick={() => ops.setHole(true)}>
          All holes
        </button>
      </div>
      <p className="b-hint">Drag the arrows to move them together, or switch to Rotate.</p>
      <ArrangeTools multi unit={unit} ops={ops} />
      <div className="b-row end">
        <button className="b-btn small" onClick={onDuplicate}>
          Duplicate
        </button>
        <button className="b-btn small danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
