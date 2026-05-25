"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Building2,
  CheckCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  User,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Listing = {
  id: string;
  zyprusListingId: string;
  agentPhone: string;
  agentName: string;
  propertyTitle: string;
  listingUrl: string;
  status: string;
  notifiedAt: string | null;
  createdAt: string;
  price: number | null;
  bedrooms: number | null;
};

export default function AdminListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    published: 0,
    expired: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = new URL("/api/admin/listings", window.location.origin);
      if (statusFilter !== "all") {
        url.searchParams.set("status", statusFilter);
      }

      const response = await fetch(url.toString(), {
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch listings");
      }

      const data = await response.json();
      setListings(data.listings || []);
      if (data.stats) setStats(data.stats);
    } catch (error) {
      console.error("Error fetching listings:", error);
      toast.error("Failed to fetch listings");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return (
          <Badge className="bg-green-100 text-green-700">
            <CheckCircle className="mr-1 h-3 w-3" />
            Published
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-red-100 text-red-700">
            <XCircle className="mr-1 h-3 w-3" />
            Expired
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-700">
            <Clock className="mr-1 h-3 w-3" />
            Draft
          </Badge>
        );
    }
  };

  const draftCount = stats.draft;
  const publishedCount = stats.published;

  return (
    <div className="mx-auto max-w-7xl space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-xl md:text-2xl">
            <Building2 className="h-5 w-5 md:h-6 md:w-6" />
            Property Listings
          </h1>
          <p className="text-muted-foreground text-sm">
            Listings uploaded to Zyprus via WhatsApp
          </p>
        </div>
        <Button
          disabled={isLoading}
          onClick={fetchListings}
          size="sm"
          variant="outline"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card>
          <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
            <CardTitle className="font-medium text-xs md:text-sm">
              Draft
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="flex items-center">
              <Clock className="mr-2 h-5 w-5 text-yellow-500 md:h-8 md:w-8" />
              <span className="font-bold text-xl md:text-3xl">
                {draftCount}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
            <CardTitle className="font-medium text-xs md:text-sm">
              Published
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="flex items-center">
              <CheckCircle className="mr-2 h-5 w-5 text-green-500 md:h-8 md:w-8" />
              <span className="font-bold text-xl md:text-3xl">
                {publishedCount}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
            <CardTitle className="font-medium text-xs md:text-sm">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
            <div className="flex items-center">
              <Building2 className="mr-2 h-5 w-5 text-blue-500 md:h-8 md:w-8" />
              <span className="font-bold text-xl md:text-3xl">
                {stats.total}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listings */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base md:text-lg">
                All Listings
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Listings uploaded to Zyprus by SOPHIA
              </CardDescription>
            </div>
            <Select onValueChange={setStatusFilter} value={statusFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading listings...
            </div>
          ) : listings.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No listings found
            </div>
          ) : (
            <>
              {/* Mobile card layout */}
              <div className="space-y-3 md:hidden">
                {listings.map((listing) => (
                  <div
                    className="space-y-2 rounded-lg border p-3"
                    key={listing.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm leading-tight">
                          {listing.propertyTitle}
                        </div>
                        <div className="mt-0.5 text-muted-foreground text-xs">
                          {[
                            listing.bedrooms ? `${listing.bedrooms} BR` : null,
                            listing.price
                              ? `\u20AC${listing.price.toLocaleString()}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" \u2022 ") || "Details pending"}
                        </div>
                      </div>
                      {getStatusBadge(listing.status)}
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-xs">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {listing.agentName}
                      </div>
                      <span>
                        {formatDistanceToNow(new Date(listing.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => window.open(listing.listingUrl, "_blank")}
                      size="sm"
                      variant="outline"
                    >
                      <ExternalLink className="mr-1 h-4 w-4" />
                      View on Zyprus
                    </Button>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listings.map((listing) => (
                      <TableRow key={listing.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {listing.propertyTitle}
                            </div>
                            <div className="text-muted-foreground text-sm">
                              {[
                                listing.bedrooms
                                  ? `${listing.bedrooms} BR`
                                  : null,
                                listing.price
                                  ? `\u20AC${listing.price.toLocaleString()}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" \u2022 ") || "Details pending"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {listing.agentName}
                            </div>
                            <div className="text-muted-foreground">
                              {listing.agentPhone}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(listing.status)}</TableCell>
                        <TableCell>
                          <div className="text-muted-foreground text-sm">
                            {formatDistanceToNow(new Date(listing.createdAt), {
                              addSuffix: true,
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() =>
                              window.open(listing.listingUrl, "_blank")
                            }
                            size="sm"
                            variant="outline"
                          >
                            <ExternalLink className="mr-1 h-4 w-4" />
                            View on Zyprus
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
