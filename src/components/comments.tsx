"use client";
import { useState } from "react";
import { Bot, Check, MessageSquare, RotateCcw, Send, User } from "lucide-react";
import type { DiagramComment } from "@/lib/diagrams/comments";
import { Dialog } from "./dialog";

export interface CommentActions {
  onAdd: (body: string, nodeId: string | null) => Promise<void>;
  onResolve: (id: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
  onAnswer: (id: string, reply: string) => Promise<void>;
}

function when(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function CommentItem({
  comment,
  actions,
  onOpenNode,
}: {
  comment: DiagramComment;
  actions: CommentActions;
  onOpenNode?: (id: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };
  const fromAgent = comment.author === "agent";
  return (
    <article
      className={`comment ${comment.status === "resolved" ? "comment-resolved" : ""}`}
    >
      <header>
        <span className={`comment-author ${fromAgent ? "agent" : ""}`}>
          {fromAgent ? <Bot size={13} /> : <User size={13} />}
          {fromAgent ? "Agent asks" : "You"}
        </span>
        {onOpenNode && comment.nodeId && (
          <button
            className="text-button"
            onClick={() => onOpenNode(comment.nodeId!)}
          >
            {comment.nodeLabel ?? comment.nodeId}
          </button>
        )}
        <time dateTime={comment.createdAt}>{when(comment.createdAt)}</time>
      </header>
      <p>{comment.body}</p>
      {comment.reply && (
        <p className="comment-reply">
          {fromAgent ? <User size={12} /> : <Bot size={12} />}
          {comment.reply}
        </p>
      )}
      <footer>
        {comment.status === "resolved" ? (
          <>
            <span className="comment-status">
              <Check size={12} />
              {fromAgent ? "Closed" : "Handled by agent"}
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => run(() => actions.onReopen(comment.id))}
            >
              <RotateCcw size={12} />
              Reopen
            </button>
          </>
        ) : fromAgent && !comment.reply ? (
          <form
            className="comment-answer"
            onSubmit={(event) => {
              event.preventDefault();
              if (!answer.trim()) return;
              void run(async () => {
                await actions.onAnswer(comment.id, answer.trim());
                setAnswer("");
              });
            }}
          >
            <input
              aria-label="Answer the agent"
              placeholder="Answer the agent"
              value={answer}
              maxLength={4000}
              onChange={(event) => setAnswer(event.target.value)}
            />
            <button className="icon-button" disabled={busy} aria-label="Send answer">
              <Send size={14} />
            </button>
          </form>
        ) : (
          <>
            <span className="comment-status">
              {fromAgent ? "Answered · waiting for the agent" : "Waiting for the agent"}
            </span>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => run(() => actions.onResolve(comment.id))}
            >
              <Check size={12} />
              Resolve
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

export function CommentComposer({
  nodeId,
  onAdd,
  placeholder,
}: {
  nodeId: string | null;
  onAdd: CommentActions["onAdd"];
  placeholder: string;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="comment-composer"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        try {
          await onAdd(body.trim(), nodeId);
          setBody("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <textarea
        aria-label="Comment for the agent"
        placeholder={placeholder}
        rows={2}
        maxLength={4000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
            event.currentTarget.form?.requestSubmit();
        }}
      />
      <button className="button small" disabled={busy || !body.trim()}>
        <Send size={13} />
        Send to agent
      </button>
    </form>
  );
}

/** Comments for one node, shown in the inspector. */
export function NodeComments({
  nodeId,
  comments,
  actions,
}: {
  nodeId: string;
  comments: DiagramComment[];
  actions: CommentActions;
}) {
  const thread = comments.filter((comment) => comment.nodeId === nodeId);
  return (
    <section className="inspector-section">
      <h3>
        <MessageSquare size={14} />
        Comments
        {thread.length > 0 && <span>{thread.length}</span>}
      </h3>
      <div className="comment-list">
        {thread.map((comment) => (
          <CommentItem key={comment.id} comment={comment} actions={actions} />
        ))}
      </div>
      <CommentComposer
        nodeId={nodeId}
        onAdd={actions.onAdd}
        placeholder="Ask the agent to change, explain or expand this step"
      />
    </section>
  );
}

/** Every comment on the diagram, plus diagram-level feedback. */
export function CommentsDialog({
  comments,
  actions,
  onOpenNode,
  onClose,
}: {
  comments: DiagramComment[];
  actions: CommentActions;
  onOpenNode: (id: string) => void;
  onClose: () => void;
}) {
  const open = comments.filter((comment) => comment.status === "open");
  const resolved = comments.filter((comment) => comment.status === "resolved");
  return (
    <Dialog
      title="Comments"
      description="Feedback you leave here reaches your agent through the get_feedback tool."
      onClose={onClose}
      wide
    >
      <div className="dialog-form">
        <CommentComposer
          nodeId={null}
          onAdd={actions.onAdd}
          placeholder="Feedback about the whole diagram"
        />
        <div className="comment-list">
          {[...open, ...resolved].map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              actions={actions}
              onOpenNode={(id) => {
                onClose();
                onOpenNode(id);
              }}
            />
          ))}
          {!comments.length && (
            <p className="muted small-copy">
              No comments yet. Select a node to comment on it.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
