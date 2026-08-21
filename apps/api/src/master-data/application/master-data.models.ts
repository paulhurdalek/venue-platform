export type EntityStatus = 'ACTIVE' | 'ARCHIVED';

export interface RoleReference {
  id: string;
  key: string;
  name: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListQuery {
  q?: string;
  status: EntityStatus | 'ALL';
  incomplete?: boolean;
  roleKey?: string;
  limit: number;
  offset: number;
}

export interface ContactSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  label: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  status: EntityStatus;
  incomplete: boolean;
}

export interface ContactAssociation {
  id: string;
  version: number;
  contact: ContactSummary;
  roles: RoleReference[];
}

export interface BusinessPartnerSummary {
  id: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  status: EntityStatus;
}

export interface ArtistRepresentative {
  id: string;
  version: number;
  businessPartnerContactId: string;
  isPrimary: boolean;
  contact: ContactSummary;
  roles: RoleReference[];
}

export interface ArtistBusinessPartnerAssociation {
  id: string;
  version: number;
  businessPartner: BusinessPartnerSummary;
  roles: RoleReference[];
  representatives: ArtistRepresentative[];
}

export interface ArtistRepresentativeValues {
  businessPartnerContactId: string;
  roleIds: string[];
  isPrimary: boolean;
}

export interface ArtistRecord {
  id: string;
  organizationId: string;
  stageName: string | null;
  firstName: string | null;
  lastName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  countryCode: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  website: string | null;
  notes: string | null;
  status: EntityStatus;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  incomplete: boolean;
  contacts: ContactAssociation[];
  businessPartners: ArtistBusinessPartnerAssociation[];
}

export interface ContactRecord extends ContactSummary {
  organizationId: string;
  notes: string | null;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  artistLinks: Array<{ id: string; entityId: string; name: string; roles: RoleReference[] }>;
  businessPartnerLinks: Array<{
    id: string;
    entityId: string;
    name: string;
    roles: RoleReference[];
  }>;
}

export interface BusinessPartnerRecord {
  id: string;
  organizationId: string;
  companyName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  countryCode: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingPostalCode: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingCountryCode: string | null;
  vatId: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  status: EntityStatus;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: RoleReference[];
  contacts: ContactAssociation[];
}

export type ArtistValues = Omit<
  ArtistRecord,
  | 'id'
  | 'organizationId'
  | 'status'
  | 'version'
  | 'archivedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'incomplete'
  | 'contacts'
  | 'businessPartners'
>;

export type ContactValues = Pick<
  ContactRecord,
  'firstName' | 'lastName' | 'label' | 'email' | 'phone' | 'mobile' | 'notes'
>;

export type ContactMatchReason = 'EMAIL' | 'PHONE' | 'NAME';

export interface ContactDuplicateMatch {
  contact: ContactSummary;
  reasons: ContactMatchReason[];
  strength: 'STRONG' | 'WEAK';
}

export type ContactReference =
  { contactId: string; contact?: never } | { contact: ContactValues; contactId?: never };

export type BusinessPartnerValues = Omit<
  BusinessPartnerRecord,
  | 'id'
  | 'organizationId'
  | 'status'
  | 'version'
  | 'archivedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'roles'
  | 'contacts'
>;
