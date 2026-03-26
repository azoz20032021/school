export type Role = 'admin' | 'teacher' | 'student' | 'assistant_admin';

export interface UserData {
    id: string;
    username: string;
    role: Role;
    name: string;
    uid: string;
    subjects?: string[];
}

export interface ClassData {
    id: string;
    name: string;
    teacher_id?: string;
    teacher_name?: string;
    teacher_ids?: string[];
    teacher_names?: string[];
}
