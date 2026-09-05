export type Role = 'admin' | 'teacher' | 'student' | 'assistant_admin';

export type AccountStatus = 'active' | 'suspended';

export interface UserData {
    id: string;
    username: string;
    role: Role;
    name: string;
    uid: string;
    status?: AccountStatus;
    subjects?: string[];

    // Student profile, filled in from the registration form.
    national_id?: string;
    mother_name?: string;
    birth_date?: string;
    birth_place?: string;
    gender?: string;
    nationality?: string;
    phone?: string;
    email?: string;
    address?: string;
    guardian_name?: string;
    guardian_phone?: string;
    guardian_relation?: string;
    guardian_job?: string;
    previous_school?: string;
    health_notes?: string;
    class_name?: string;

    /** Fees owed, attached by the server for students. */
    dues?: StudentDues;
}

export interface StudentDues {
    outstanding: number;
    /** The earliest date still owed. */
    next_due_date: string | null;
    /** That date has passed with money still owed: the account is locked. */
    blocked: boolean;
}

export interface ClassData {
    id: string;
    name: string;
    capacity?: number;
    teacher_id?: string;
    teacher_name?: string;
    teacher_ids?: string[];
    teacher_names?: string[];
}

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface Registration {
    id: string;
    tracking_code: string;
    status: RegistrationStatus;
    full_name: string;
    mother_name?: string;
    national_id: string;
    birth_date: string;
    birth_place?: string;
    gender?: string;
    nationality?: string;
    phone: string;
    email?: string;
    address: string;
    guardian_name: string;
    guardian_phone: string;
    guardian_relation: string;
    guardian_job?: string;
    previous_school?: string;
    last_grade?: string;
    last_average?: string;
    health_notes?: string;
    notes?: string;
    requested_class_id?: string | null;
    requested_class_name?: string | null;
    rejection_reason?: string;
    assigned_uid?: string;
    reviewed_by_name?: string;
    createdAt?: { seconds: number };
    reviewed_at?: { seconds: number };
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled';

export interface Invoice {
    id: string;
    student_id: string;
    student_name: string;
    student_uid: string;
    class_id?: string | null;
    class_name?: string | null;
    title: string;
    category: string;
    amount: number;
    discount: number;
    paid_amount: number;
    net_amount?: number;
    remaining?: number;
    currency: string;
    due_date?: string | null;
    term?: string | null;
    academic_year?: number;
    status: InvoiceStatus;
    created_by_name?: string;
    createdAt?: { seconds: number };
}

export interface Payment {
    id: string;
    invoice_id: string;
    invoice_title: string;
    student_id: string;
    student_name: string;
    amount: number;
    method: string;
    paid_at: string;
    note?: string;
    receipt_no: string;
    recorded_by_name?: string;
    createdAt?: { seconds: number };
}

export interface FinanceSummary {
    total_billed: number;
    total_paid: number;
    outstanding: number;
    overdue_count: number;
    overdue_amount: number;
    is_clear: boolean;
}

export interface StudentFinanceRow {
    student_id: string;
    name: string;
    uid: string;
    national_id?: string;
    phone: string;
    guardian_phone: string;
    class_id: string | null;
    class_name: string;
    total_billed: number;
    total_paid: number;
    outstanding: number;
    overdue_amount: number;
    next_due_date?: string | null;
    payment_status: string;
    is_clear: boolean;
    is_overdue?: boolean;
}

export interface BehaviorNote {
    id: string;
    student_id: string;
    student_name: string;
    student_uid?: string;
    class_id?: string | null;
    type: 'positive' | 'negative';
    category: string;
    title: string;
    description?: string;
    points: number;
    date: string;
    created_by_name?: string;
    createdAt?: { seconds: number };
}

export interface AuditEntry {
    id: string;
    actor_name: string;
    actor_role: string;
    action: string;
    entity: string;
    entity_id?: string | null;
    summary: string;
    ip?: string;
    createdAt?: { seconds: number };
}
