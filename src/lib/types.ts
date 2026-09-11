export type BoardRole = 'owner' | 'admin' | 'member' | 'viewer';

export type Board = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type BoardMember = {
  board_id: string;
  user_id: string;
  role: BoardRole;
};

export type List = {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type Card = {
  id: string;
  list_id: string;
  title: string;
  description: string | null;
  position: number;
  assignee_id: string | null;
  due_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
