"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Building2,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  Phone,
  RefreshCw,
  Upload,
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
  name: string;
  description: string | null;
  price: string | null;
  currency: string | null;
  propertyType: string | null;
  status: string | null;
  reviewStatus: string | null;
  zyprusListingId: string | null;
  zyprusListingUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
  address: string | null;
  numberOfRooms: number | null;
  numberOfBathroomsTotal: string | null;
  floorSize: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  swimmingPool: string | null;
  hasParking: boolean | null;
  hasAirConditioning: boolean | null;
  backofficeNotes: string | null;
  googleMapsUrl: string | null;
  reviewNotes: string | null;
  userId: string | null;
  userEmail: string | null;
  // Reference ID, AI notes, and duplicate detection fields
  referenceId: string | null;
  propertyNotes: string | null;
  duplicateDetected: boolean | null;
};

export default function AdminListingsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadingId, setUploadingId] = useState<string | null>(null);

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

  const handleUpload = async (listingId: string) => {
    setUploadingId(listingId);
    try {
      const response = await fetch("/api/listings/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ listingId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload");
      }

      const result = await response.json();
      toast.success("Listing uploaded to Zyprus!");

      if (result.listingUrl) {
        window.open(result.listingUrl, "_blank");
      }

      await fetchListings();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to upload listing"
      );
    } finally {
      setUploadingId(null);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "uploaded":
        return (
          <Badge className="bg-green-100 text-green-700">
            <CheckCircle className="mr-1 h-3 w-3" />
            Uploaded
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-700">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
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

  const draftCount = listings.filter((l) => l.status === "draft").length;
  const uploadedCount = listings.filter((l) => l.status === "uploaded").length;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-bold text-2xl">
            <Building2 className="h-6 w-6" />
            Property Listings Review
          </h1>
          <p className="text-muted-foreground">
            Review and approve property listings submitted via Telegram
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

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-sm">
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Clock className="mr-2 h-8 w-8 text-yellow-500" />
              <span className="font-bold text-3xl">{draftCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-sm">Uploaded</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <CheckCircle className="mr-2 h-8 w-8 text-green-500" />
              <span className="font-bold text-3xl">{uploadedCount}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-medium text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <Building2 className="mr-2 h-8 w-8 text-blue-500" />
              <span className="font-bold text-3xl">{listings.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Listings</CardTitle>
              <CardDescription>
                Click "Upload to Zyprus" to publish a draft listing
              </CardDescription>
            </div>
            <Select onValueChange={setStatusFilter} value={statusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
                <SelectItem value="uploaded">Uploaded</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading listings...
            </div>
          ) : listings.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No listings found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Reference / Notes</TableHead>
                  <TableHead>Features</TableHead>
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
                        <div className="font-medium">{listing.name}</div>
                        <div className="text-muted-foreground text-sm">
                          {listing.propertyType} • {listing.numberOfRooms} BR •{" "}
                          {listing.floorSize}m²
                        </div>
                        <div className="font-medium text-sm">
                          €{listing.price}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {listing.ownerName || listing.ownerPhone ? (
                        <div className="text-sm">
                          {listing.ownerName && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {listing.ownerName}
                            </div>
                          )}
                          {listing.ownerPhone && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {listing.ownerPhone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Not provided
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {/* Reference ID */}
                        {listing.referenceId ? (
                          <div className="font-mono text-xs">
                            Ref: {listing.referenceId}
                          </div>
                        ) : (
                          <div className="text-muted-foreground text-xs">
                            No reference ID
                          </div>
                        )}
                        {/* Duplicate Warning */}
                        {listing.duplicateDetected && (
                          <Badge className="bg-orange-100 text-orange-700">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Potential Duplicate
                          </Badge>
                        )}
                        {/* AI Notes indicator */}
                        {listing.propertyNotes && (
                          <div
                            className="flex cursor-pointer items-center gap-1 text-blue-600 text-xs hover:underline"
                            onClick={() => {
                              toast.info(listing.propertyNotes || "No notes", {
                                duration: 10_000,
                                description: "SOPHIA AI Notes",
                              });
                            }}
                            title={listing.propertyNotes}
                          >
                            <FileText className="h-3 w-3" />
                            View AI Notes
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {listing.swimmingPool &&
                          listing.swimmingPool !== "none" && (
                            <Badge className="text-xs" variant="outline">
                              🏊 {listing.swimmingPool}
                            </Badge>
                          )}
                        {listing.hasParking && (
                          <Badge className="text-xs" variant="outline">
                            🅿️ Parking
                          </Badge>
                        )}
                        {listing.hasAirConditioning && (
                          <Badge className="text-xs" variant="outline">
                            ❄️ AC
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(listing.status)}</TableCell>
                    <TableCell>
                      <div className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(listing.createdAt), {
                          addSuffix: true,
                        })}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        via{" "}
                        {listing.userEmail?.startsWith("guest-")
                          ? "Telegram"
                          : "Web"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {listing.status === "draft" && (
                        <Button
                          disabled={uploadingId === listing.id}
                          onClick={() => handleUpload(listing.id)}
                          size="sm"
                        >
                          {uploadingId === listing.id ? (
                            <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="mr-1 h-4 w-4" />
                          )}
                          Upload to Zyprus
                        </Button>
                      )}
                      {listing.zyprusListingUrl && (
                        <Button
                          onClick={() => {
                            if (listing.zyprusListingUrl) {
                              window.open(listing.zyprusListingUrl, "_blank");
                            }
                          }}
                          size="sm"
                          variant="outline"
                        >
                          <ExternalLink className="mr-1 h-4 w-4" />
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
