import { useEffect, useState } from "react";
import {
  MessageSquarePlus,
  ThumbsUp,
  ThumbsDown,
  Plus,
  Trash2,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAdmin } from "@/lib/admin-store";

export interface FeedbackItem {
  id: string;
  title: string;
  description: string;
  author: string;
  category: string;
  votes: number;
  created_at?: string;
}

export interface CommentItem {
  id: string;
  feedback_id: string;
  author: string;
  content: string;
  created_at: string;
}

const CATEGORIES = ["Workflow Request", "Directory Update", "New Resource", "Tooling / Automation"];

export function FeedbackBoard() {
  const { isAdmin } = useAdmin();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [commentsMap, setCommentsMap] = useState<Record<string, CommentItem[]>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

  // Submission form states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("Workflow Request");
  const [submitting, setSubmitting] = useState(false);

  // Comment input states keyed by feedback item ID
  const [commentInputs, setCommentInputs] = useState<Record<string, { author: string; content: string }>>({});

  // Local reaction tracker: { [feedbackId]: 'up' | 'down' }
  const [userReactions, setUserReactions] = useState<Record<string, "up" | "down">>({});

  useEffect(() => {
    fetchFeedback();
    fetchComments();
    try {
      const savedReactions = localStorage.getItem("csm_feedback_user_reactions");
      if (savedReactions) setUserReactions(JSON.parse(savedReactions));
    } catch {
      /* ignore storage errors */
    }
  }, []);

  async function fetchFeedback() {
    try {
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .order("votes", { ascending: false });

      if (!error && data) setItems(data as FeedbackItem[]);
    } catch (e) {
      console.warn("Error fetching wishlist items:", e);
    }
  }

  async function fetchComments() {
    try {
      const { data, error } = await supabase
        .from("feedback_comments")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data) {
        const map: Record<string, CommentItem[]> = {};
        (data as CommentItem[]).forEach((c) => {
          if (!map[c.feedback_id]) map[c.feedback_id] = [];
          map[c.feedback_id]!.push(c);
        });
        setCommentsMap(map);
      }
    } catch (e) {
      console.warn("Error fetching comments:", e);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    const newItem = {
      title: title.trim(),
      description: description.trim(),
      author: author.trim() || "Anonymous CSM",
      category,
      votes: 1,
    };

    const { data, error } = await supabase.from("feedback").insert([newItem]).select();

    if (!error && data && data[0]) {
      setItems((prev) => [data[0] as FeedbackItem, ...prev]);
      setTitle("");
      setDescription("");
      setAuthor("");
    }
    setSubmitting(false);
  }

  async function handleReaction(id: string, currentVotes: number, type: "up" | "down") {
    const existing = userReactions[id];
    let voteChange = 0;
    let nextReaction: "up" | "down" | null = type;

    if (existing === type) {
      // Toggle off / remove reaction
      voteChange = type === "up" ? -1 : 1;
      nextReaction = null;
    } else if (existing) {
      // Switch reaction from up -> down or down -> up
      voteChange = type === "up" ? 2 : -2;
    } else {
      // New reaction
      voteChange = type === "up" ? 1 : -1;
    }

    const updatedVotes = currentVotes + voteChange;

    const nextUserReactions = { ...userReactions };
    if (nextReaction) nextUserReactions[id] = nextReaction;
    else delete nextUserReactions[id];

    setUserReactions(nextUserReactions);
    localStorage.setItem("csm_feedback_user_reactions", JSON.stringify(nextUserReactions));

    // Optimistic UI update
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, votes: updatedVotes } : item))
    );

    await supabase.from("feedback").update({ votes: updatedVotes }).eq("id", id);
  }

  async function handleAddComment(feedbackId: string) {
    const input = commentInputs[feedbackId];
    if (!input || !input.content.trim()) return;

    const newComment = {
      feedback_id: feedbackId,
      author: input.author.trim() || "CSM Team Member",
      content: input.content.trim(),
    };

    const { data, error } = await supabase.from("feedback_comments").insert([newComment]).select();

    if (!error && data && data[0]) {
      const added = data[0] as CommentItem;
      setCommentsMap((prev) => ({
        ...prev,
        [feedbackId]: [...(prev[feedbackId] || []), added],
      }));
      setCommentInputs((prev) => ({
        ...prev,
        [feedbackId]: { author: "", content: "" },
      }));
    }
  }

  async function handleDeleteComment(commentId: string, feedbackId: string) {
    if (!confirm("Delete this comment?")) return;
    setCommentsMap((prev) => ({
      ...prev,
      [feedbackId]: (prev[feedbackId] || []).filter((c) => c.id !== commentId),
    }));
    await supabase.from("feedback_comments").delete().eq("id", commentId);
  }

  async function handleDeleteItem(id: string) {
    if (!confirm("Are you sure you want to delete this wishlist item and all its comments?")) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
    await supabase.from("feedback").delete().eq("id", id);
  }

  const toggleCommentsView = (id: string) => {
    setExpandedComments((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Wishlist Header Banner */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquarePlus className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">CSM Feedback &amp; Wishlist</h2>
            <p className="text-xs text-muted-foreground">
              Request new department routing, workflow improvements, or collaborate in discussion threads.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Submission Form */}
        <div className="lg:col-span-1">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-border bg-card p-5 space-y-4 sticky top-20"
          >
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Plus className="size-4 text-primary" /> Submit Request
            </h3>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Title *</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Add Slack Bot for Escalations"
                className="text-xs h-9"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Your Name</label>
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Ethan (or leave blank)"
                className="text-xs h-9"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Details</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly explain what you need..."
                className="text-xs min-h-[80px]"
              />
            </div>

            <Button type="submit" size="sm" className="w-full text-xs" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Request"}
            </Button>
          </form>
        </div>

        {/* Requests List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground mb-2">
            Community Requests ({items.length})
          </h3>

          {items.map((item) => {
            const reaction = userReactions[item.id];
            const comments = commentsMap[item.id] || [];
            const isExpanded = expandedComments[item.id];
            const currentInput = commentInputs[item.id] || { author: "", content: "" };

            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 space-y-3"
              >
                <div className="flex items-start gap-4">
                  {/* Up/Down Reaction Column */}
                  <div className="flex flex-col items-center gap-1 shrink-0 rounded-lg border border-border/80 bg-muted/20 p-1">
                    <button
                      onClick={() => handleReaction(item.id, item.votes, "up")}
                      className={`p-1.5 rounded-md transition-colors ${
                        reaction === "up"
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      title={reaction === "up" ? "Remove Upvote" : "Upvote"}
                    >
                      <ThumbsUp className="size-3.5" />
                    </button>

                    <span className="text-xs font-bold px-1">{item.votes}</span>

                    <button
                      onClick={() => handleReaction(item.id, item.votes, "down")}
                      className={`p-1.5 rounded-md transition-colors ${
                        reaction === "down"
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      title={reaction === "down" ? "Remove Downvote" : "Downvote"}
                    >
                      <ThumbsDown className="size-3.5" />
                    </button>
                  </div>

                  {/* Main Request Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {item.category}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">by {item.author}</span>
                      </div>

                      {isAdmin ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteItem(item.id)}
                          title="Admin: Delete Request"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>

                    <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                    {item.description ? (
                      <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                    ) : null}

                    {/* Toggle Comments Button */}
                    <div className="pt-2">
                      <button
                        onClick={() => toggleCommentsView(item.id)}
                        className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                      >
                        <MessageSquare className="size-3.5" />
                        {comments.length === 0 ? "Add Comment" : `${comments.length} Comments`}
                        {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Collapsible Comment Thread */}
                {isExpanded ? (
                  <div className="pt-3 border-t border-border/60 space-y-3 pl-2 sm:pl-4">
                    {/* List of Existing Comments */}
                    {comments.length > 0 ? (
                      <div className="space-y-2">
                        {comments.map((comment) => (
                          <div
                            key={comment.id}
                            className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 p-2.5 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-foreground block mb-0.5">
                                {comment.author}
                              </span>
                              <p className="text-muted-foreground leading-relaxed">
                                {comment.content}
                              </p>
                            </div>
                            {isAdmin ? (
                              <button
                                onClick={() => handleDeleteComment(comment.id, item.id)}
                                className="text-muted-foreground hover:text-destructive shrink-0"
                                title="Admin: Delete Comment"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">
                        No comments yet. Start the conversation below.
                      </p>
                    )}

                    {/* New Comment Input Box */}
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-2">
                        <Input
                          value={currentInput.author}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({
                              ...prev,
                              [item.id]: { ...currentInput, author: e.target.value },
                            }))
                          }
                          placeholder="Your Name (optional)"
                          className="text-xs h-8 w-1/3"
                        />
                        <Input
                          value={currentInput.content}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({
                              ...prev,
                              [item.id]: { ...currentInput, content: e.target.value },
                            }))
                          }
                          placeholder="Write a comment..."
                          className="text-xs h-8 flex-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddComment(item.id);
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleAddComment(item.id)}
                          className="h-8 px-3 text-xs gap-1"
                        >
                          <Send className="size-3" /> Post
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
              No wishlist items submitted yet. Be the first to make a request!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}