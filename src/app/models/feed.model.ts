export interface FeedItem {
    kind: string;
    agency: string;
    category?: string | null;
    realtime_feed?: string;
    url: string;
    is_enabled: boolean;
}

export interface Feed {
    static: FeedItem[];
    realtime: FeedItem[];
}
