import LimitService from '@tryghost/limit-service';
import useStaffUsers from './useStaffUsers';
import {useBrowseMembers} from '../api/members';
import {useBrowseNewsletters} from '../api/newsletters';
import {useGlobalData} from '../components/providers/GlobalDataProvider';
import {useMemo} from 'react';

export class LimitError extends Error {
    public readonly errorType: string;
    public readonly errorDetails: string;

    constructor({errorType, errorDetails, message}: {errorType: string, errorDetails: string, message: string}) {
        super(message);
        this.errorType = errorType;
        this.errorDetails = errorDetails;
    }
}

export class IncorrectUsageError extends LimitError {
    constructor(options: {errorDetails: string, message: string}) {
        super(Object.assign({errorType: 'IncorrectUsageError'}, options));
    }
}

export class HostLimitError extends LimitError {
    constructor(options: {errorDetails: string, message: string}) {
        super(Object.assign({errorType: 'HostLimitError'}, options));
    }
}

interface LimiterLimits {
    staff?: {
        max?: number
        error?: string
        currentCountQuery?: () => Promise<number>
    }
    members?: {
        max?: number
        error?: string
        currentCountQuery?: () => Promise<number>
    }
    newsletters?: {
        max?: number
        error?: string
        currentCountQuery?: () => Promise<number>
    }
}

export const useLimiter = () => {
    const {config} = useGlobalData();

    const {users, contributorUsers, invites, isLoading} = useStaffUsers();
    const {refetch: fetchMembers} = useBrowseMembers({
        searchParams: {limit: '1'},
        enabled: false
    });
    const {refetch: fetchNewsletters} = useBrowseNewsletters({
        searchParams: {filter: 'status:active', limit: 'all'},
        enabled: false
    });

    const helpLink = useMemo(() => {
        if (config.hostSettings?.billing?.enabled === true && config.hostSettings?.billing?.url) {
            return config.hostSettings.billing.url;
        } else {
            return 'https://ghost.org/help/';
        }
    }, [config.hostSettings?.billing]);

    return useMemo(() => {
        const limits = config.hostSettings?.limits as LimiterLimits;

        if (!limits || isLoading) {
            return;
        }

        const limiter = new LimitService();

        if (limits.staff) {
            limits.staff.currentCountQuery = async () => {
                const staffUsers = users.filter(u => u.status !== 'inactive' && !contributorUsers.includes(u));
                const staffInvites = invites.filter(i => i.role !== 'Contributor');

                return staffUsers.length + staffInvites.length;
            };
        }

        if (limits.members) {
            limits.members.currentCountQuery = async () => {
                const {data: members} = await fetchMembers();
                return members?.meta?.pagination?.total || 0;
            };
        }

        if (limits.newsletters) {
            limits.newsletters.currentCountQuery = async () => {
                const {data: {newsletters} = {newsletters: []}} = await fetchNewsletters();
                return newsletters?.length || 0;
            };
        }

        limiter.loadLimits({
            limits,
            helpLink,
            errors: {
                HostLimitError,
                IncorrectUsageError
            }
        });

        return {
            isLimited: (limitName: string): boolean => limiter.isLimited(limitName),
            checkWouldGoOverLimit: (limitName: string): Promise<boolean> => limiter.checkWouldGoOverLimit(limitName),
            errorIfWouldGoOverLimit: (limitName: string, metadata: Record<string, unknown> = {}): Promise<void> => limiter.errorIfWouldGoOverLimit(limitName, metadata),
            errorIfIsOverLimit: (limitName: string): Promise<void> => limiter.errorIfIsOverLimit(limitName)
        };
    }, [config.hostSettings?.limits, contributorUsers, fetchMembers, fetchNewsletters, helpLink, invites, isLoading, users]);
};