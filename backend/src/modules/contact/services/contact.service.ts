import { Contact, IContact, ContactReason } from '../models/contact.model';
import { v4 as uuidv4 } from 'uuid';

export interface CreateContactDto {
  fullName: string;
  mobileNumber: string;
  emailAddress: string;
  address?: string;
  reasonToContact: ContactReason;
  message?: string;
  companyName?: string;
  preferredDeliveryDate?: string;
}

export class ContactService {
  async submitContact(data: CreateContactDto): Promise<{ referenceId: string; contact: IContact }> {
    const referenceId = this.generateReferenceId(data.reasonToContact);

    const contactData = {
      ...data,
      referenceId,
      status: 'new',
      preferredDeliveryDate: data.preferredDeliveryDate ? new Date(data.preferredDeliveryDate) : undefined,
    };

    const contact = await Contact.create(contactData);
    return {
      referenceId,
      contact: contact.toObject() as IContact,
    };
  }

  async getAllSubmissions(filter?: {
    reasonToContact?: ContactReason;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filter?.page || 1;
    const limit = filter?.limit || 10;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (filter?.reasonToContact) {
      query.reasonToContact = filter.reasonToContact;
    }
    if (filter?.status) {
      query.status = filter.status;
    }

    const [submissions, total] = await Promise.all([
      Contact.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Contact.countDocuments(query),
    ]);

    return {
      submissions: submissions.map((s) => s.toObject() as IContact),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSubmissionById(referenceId: string): Promise<IContact | null> {
    const submission = await Contact.findOne({ referenceId }).exec();
    return submission ? (submission.toObject() as IContact) : null;
  }

  async updateSubmissionStatus(
    referenceId: string,
    status: 'new' | 'contacted' | 'resolved',
    internalNotes?: string
  ) {
    const updated = await Contact.findOneAndUpdate(
      { referenceId },
      { status, internalNotes },
      { new: true }
    ).exec();
    return updated ? (updated.toObject() as IContact) : null;
  }

  async deleteSubmission(referenceId: string) {
    return await Contact.findOneAndDelete({ referenceId }).exec();
  }

  async getMetrics() {
    const [totalCount, helpCount, bulkCount, giftingCount, newCount, contactedCount, resolvedCount] = await Promise.all([
      Contact.countDocuments(),
      Contact.countDocuments({ reasonToContact: 'help' }),
      Contact.countDocuments({ reasonToContact: 'bulk' }),
      Contact.countDocuments({ reasonToContact: 'gifting' }),
      Contact.countDocuments({ status: 'new' }),
      Contact.countDocuments({ status: 'contacted' }),
      Contact.countDocuments({ status: 'resolved' }),
    ]);

    return {
      total: totalCount,
      byReason: {
        help: helpCount,
        bulk: bulkCount,
        gifting: giftingCount,
      },
      byStatus: {
        new: newCount,
        contacted: contactedCount,
        resolved: resolvedCount,
      },
    };
  }

  private generateReferenceId(reason: ContactReason): string {
    const prefixes = {
      help: 'HELP',
      bulk: 'BULK',
      gifting: 'GIFT',
    };
    const prefix = prefixes[reason];
    const uniquePart = uuidv4().substring(0, 8).toUpperCase();
    return `${prefix}-${uniquePart}`;
  }
}

export const contactService = new ContactService();
